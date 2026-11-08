import BN from "bn.js";
import { BorshCoder, EventParser, type Idl } from "@anchor-lang/core";
import { PublicKey, type Connection } from "@solana/web3.js";
import idlJson from "../idl/spendguard.json";
import { loadConfig } from "../config";
import { getConnection } from "../chain/connection";
import { fetchPolicy } from "../chain/policy";
import {
  getDb,
  getPolicyOwner,
  getRecipientStats,
  savePayment,
  upsertPolicy,
} from "../db";
import { raiseAlert, type AlertType } from "../alerts";
import { detectAnomalies } from "../anomaly";

/**
 * Program-event watcher (AGENTS.md section 6, M5).
 *
 * Events are decoded straight from the transaction logs with Anchor's
 * `EventParser`, the same parser the Anchor client uses. Nothing here blocks a
 * payment: the watcher only turns confirmed events into payments and alerts
 * (hard rule 9).
 */

const DEFAULT_BACKFILL_LIMIT = 100;
const MAX_BACKFILL_LIMIT = 1_000;
const DEFAULT_HEALTH_CHECK_MS = 30_000;
const WS_STUCK_MS = 60_000;
const RECONNECT_RETRY_MS = 5_000;

/** A decoded IDL event. `data` is narrowed per event name below. */
export interface DecodedEvent {
  name: string;
  data: unknown;
}

/**
 * Runtime event names and fields come from `src/idl/spendguard.json`, which is
 * Anchor's native (PascalCase event / snake_case field) IDL. The generated
 * `src/idl/spendguard.ts` helper is camelCase and describes the TypeScript
 * client API, not the decoded log payload.
 *
 * Every raw field name below is the exact decoded key, checked against the
 * IDL's `types` section and a real devnet transaction. `u64`/`i64` arrive as
 * `BN`; `normalizeEvent` validates each key and converts integers to `bigint`
 * once, so a renamed or missing field fails with a message naming the field
 * instead of crashing inside `BN`.
 */
export type EventName =
  | "PolicyInitialized"
  | "PaymentExecuted"
  | "WithdrawRequested"
  | "WithdrawExecuted"
  | "WithdrawCancelled"
  | "RecipientAdded"
  | "PausedChanged";

export type NormalizedEvent =
  | { name: "PolicyInitialized"; policy: string; owner: string; agent: string }
  | {
      name: "PaymentExecuted";
      policy: string;
      recipient: string;
      amount: bigint;
      spentInWindow: bigint;
      windowLimit: bigint;
      timestamp: bigint;
    }
  | { name: "WithdrawRequested"; policy: string; amount: bigint; unlockAt: bigint }
  | { name: "WithdrawExecuted"; policy: string; owner: string; amount: bigint }
  | { name: "WithdrawCancelled"; policy: string }
  | { name: "RecipientAdded"; policy: string; recipient: string }
  | { name: "PausedChanged"; policy: string; paused: boolean };

export type NormalizedEventFor<N extends EventName> = Extract<NormalizedEvent, { name: N }>;

/** Owner lookups are immutable, so caching them avoids an RPC read per event. */
const ownerCache = new Map<string, string>();

/**
 * Decode every event in one transaction's log array.
 *
 * `EventParser` tracks the CPI program stack, so only `Program data:` lines
 * emitted by our program are yielded. `errorOnDecodeFailure` stays false: a
 * log line that is not one of our events is normal, not an error.
 */
function createEventParser(programId: PublicKey): EventParser {
  const idl = idlJson as unknown as Idl;
  return new EventParser(programId, new BorshCoder(idl));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function dedupeKey(type: AlertType, policy: string, signature: string): string {
  return `${type}:${policy}:${signature}`;
}

/**
 * The decoded keys are read by their exact names, never by a guessed alias.
 * A missing key is a programming error, so the message names the field and
 * lists the keys that were actually present.
 */
function readField(data: Record<string, unknown>, event: string, field: string): unknown {
  const value = data[field];
  if (value === undefined || value === null) {
    const keys = Object.keys(data);
    throw new Error(
      `event ${event} is missing field "${field}"; decoded keys are [${keys.join(", ")}]`,
    );
  }
  return value;
}

function readPubkey(data: Record<string, unknown>, event: string, field: string): string {
  const value = readField(data, event, field);
  if (!(value instanceof PublicKey)) {
    throw new Error(`event ${event} field "${field}" is not a PublicKey`);
  }
  return value.toBase58();
}

function readBigInt(data: Record<string, unknown>, event: string, field: string): bigint {
  const value = readField(data, event, field);
  if (value instanceof BN) {
    return BigInt(value.toString(10));
  }
  if (typeof value === "bigint") {
    return value;
  }
  throw new Error(`event ${event} field "${field}" is not an integer (got ${typeof value})`);
}

function readBool(data: Record<string, unknown>, event: string, field: string): boolean {
  const value = readField(data, event, field);
  if (typeof value !== "boolean") {
    throw new Error(`event ${event} field "${field}" is not a boolean`);
  }
  return value;
}

/**
 * Validate one decoded event and convert its `BN` integers to `bigint`.
 *
 * Raw keys come from the JSON IDL: `WithdrawRequested` carries `unlock_at`,
 * not `unlockAt`. Throwing here (rather than reading a missing property) is
 * what turns "Cannot read properties of undefined" into a fixable error.
 */
export function normalizeEvent(event: DecodedEvent): NormalizedEvent {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const name = event.name;

  switch (name) {
    case "PolicyInitialized":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        owner: readPubkey(data, name, "owner"),
        agent: readPubkey(data, name, "agent"),
      };
    case "PaymentExecuted":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        recipient: readPubkey(data, name, "recipient"),
        amount: readBigInt(data, name, "amount"),
        spentInWindow: readBigInt(data, name, "spent_in_window"),
        windowLimit: readBigInt(data, name, "window_limit"),
        timestamp: readBigInt(data, name, "timestamp"),
      };
    case "WithdrawRequested":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        amount: readBigInt(data, name, "amount"),
        unlockAt: readBigInt(data, name, "unlock_at"),
      };
    case "WithdrawExecuted":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        owner: readPubkey(data, name, "owner"),
        amount: readBigInt(data, name, "amount"),
      };
    case "WithdrawCancelled":
      return { name, policy: readPubkey(data, name, "policy") };
    case "RecipientAdded":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        recipient: readPubkey(data, name, "recipient"),
      };
    case "PausedChanged":
      return {
        name,
        policy: readPubkey(data, name, "policy"),
        paused: readBool(data, name, "paused"),
      };
    default:
      throw new Error(
        `unknown event "${String(name)}"; decoded keys are [${Object.keys(data).join(", ")}]`,
      );
  }
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set<EventName>([
  "PolicyInitialized",
  "PaymentExecuted",
  "WithdrawRequested",
  "WithdrawExecuted",
  "WithdrawCancelled",
  "RecipientAdded",
  "PausedChanged",
]);

/**
 * Converts a normalized integer to a safe JS number for the number-typed APIs
 * (`detectAnomalies`, `savePayment`, alert `data`). Those stay numbers because
 * alert payloads go through `JSON.stringify`, which cannot serialize bigint.
 */
function toNumber(value: bigint, event: string, field: string): number {
  if (value < 0n) {
    throw new Error(`event ${event} field "${field}" is negative: ${value}`);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `event ${event} field "${field}" ${value} exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  return Number(value);
}

/**
 * The alert's owner. Prefer the `policies` index; if the watcher sees a policy
 * created before this database existed, read it from chain once and index it.
 */
async function resolveOwner(policy: string): Promise<string> {
  const cached = ownerCache.get(policy);
  if (cached !== undefined) {
    return cached;
  }

  const indexed = getPolicyOwner(getDb(), policy);
  if (indexed !== null) {
    ownerCache.set(policy, indexed);
    return indexed;
  }

  const account = await fetchPolicy(policy);
  const owner = account.owner.toBase58();
  ownerCache.set(policy, owner);
  upsertPolicy(getDb(), {
    address: policy,
    owner,
    agent: account.agent.toBase58(),
    policyId: account.policyId.toString(),
  });
  return owner;
}

async function handlePolicyInitialized(
  data: NormalizedEventFor<"PolicyInitialized">,
): Promise<void> {
  const { policy, owner, agent } = data;

  // The event does not carry `policy_id`; the account does. If it cannot be
  // read (for example the policy was already closed), keep a placeholder so
  // the index row still exists for owner lookups.
  let policyId = "0";
  try {
    const account = await fetchPolicy(policy);
    policyId = account.policyId.toString();
  } catch (err: unknown) {
    console.warn(
      `[watcher] could not read policy ${policy} to index its policy_id: ${errorMessage(err)}`,
    );
  }

  upsertPolicy(getDb(), { address: policy, owner, agent, policyId });
  ownerCache.set(policy, owner);
}

async function handlePaymentExecuted(
  data: NormalizedEventFor<"PaymentExecuted">,
  signature: string,
): Promise<void> {
  const { policy, recipient, name } = data;
  const amountLamports = toNumber(data.amount, name, "amount");
  const spentInWindow = toNumber(data.spentInWindow, name, "spent_in_window");
  const windowLimit = toNumber(data.windowLimit, name, "window_limit");
  const eventTimestamp = toNumber(data.timestamp, name, "timestamp");

  const owner = await resolveOwner(policy);

  // Order matters (AGENTS.md section 6): stats must describe EARLIER payments.
  const recipientStats = getRecipientStats(getDb(), policy, recipient);

  savePayment(getDb(), {
    signature,
    policy,
    recipient,
    amount_lamports: amountLamports,
    timestamp: eventTimestamp > 0 ? eventTimestamp * 1_000 : Date.now(),
  });

  const alerts = detectAnomalies(
    {
      policy,
      recipient,
      amountLamports,
      txSignature: signature,
      recipientStats,
    },
    {
      owner,
      spentInWindow,
      windowLimit,
    },
  );

  for (const alert of alerts) {
    await raiseAlert(alert);
  }
}

async function handleWithdrawRequested(
  data: NormalizedEventFor<"WithdrawRequested">,
  signature: string,
): Promise<void> {
  const { policy, name } = data;
  const amountLamports = toNumber(data.amount, name, "amount");
  const unlockAt = toNumber(data.unlockAt, name, "unlock_at");
  const owner = await resolveOwner(policy);
  const unlockIso = new Date(unlockAt * 1_000).toISOString();

  await raiseAlert({
    policy,
    owner,
    type: "WITHDRAWAL_REQUESTED",
    severity: "critical",
    title: "Withdrawal requested",
    message: `Withdrawal of ${amountLamports} lamports requested. It can be released after ${unlockIso}.`,
    data: { amountLamports, unlockAt },
    txSignature: signature,
    dedupeKey: dedupeKey("WITHDRAWAL_REQUESTED", policy, signature),
  });
}

async function handleWithdrawExecuted(
  data: NormalizedEventFor<"WithdrawExecuted">,
  signature: string,
): Promise<void> {
  const { policy, owner, name } = data;
  const amountLamports = toNumber(data.amount, name, "amount");

  await raiseAlert({
    policy,
    owner,
    type: "WITHDRAWAL_EXECUTED",
    severity: "warning",
    title: "Withdrawal released",
    message: `Withdrawal of ${amountLamports} lamports was released to ${owner}.`,
    data: { amountLamports, owner },
    txSignature: signature,
    dedupeKey: dedupeKey("WITHDRAWAL_EXECUTED", policy, signature),
  });
}

async function handleWithdrawCancelled(
  data: NormalizedEventFor<"WithdrawCancelled">,
  signature: string,
): Promise<void> {
  const { policy } = data;
  const owner = await resolveOwner(policy);

  await raiseAlert({
    policy,
    owner,
    type: "WITHDRAWAL_CANCELLED",
    severity: "info",
    title: "Withdrawal cancelled",
    message: "The pending withdrawal was cancelled by the owner.",
    txSignature: signature,
    dedupeKey: dedupeKey("WITHDRAWAL_CANCELLED", policy, signature),
  });
}

async function handleRecipientAdded(
  data: NormalizedEventFor<"RecipientAdded">,
  signature: string,
): Promise<void> {
  const { policy, recipient } = data;
  const owner = await resolveOwner(policy);

  await raiseAlert({
    policy,
    owner,
    type: "RECIPIENT_ADDED",
    severity: "warning",
    title: "Recipient added",
    message: `Recipient ${recipient} was added to the allowlist.`,
    data: { recipient },
    txSignature: signature,
    dedupeKey: dedupeKey("RECIPIENT_ADDED", policy, signature),
  });
}

async function handlePausedChanged(
  data: NormalizedEventFor<"PausedChanged">,
  signature: string,
): Promise<void> {
  const { policy, paused } = data;
  const owner = await resolveOwner(policy);
  const type: AlertType = paused ? "POLICY_PAUSED" : "POLICY_RESUMED";

  await raiseAlert({
    policy,
    owner,
    type,
    severity: "info",
    title: paused ? "Policy paused" : "Policy resumed",
    message: paused
      ? "The owner paused the policy. Agent payments are blocked until it resumes."
      : "The owner resumed the policy. Agent payments are allowed again.",
    data: { paused },
    txSignature: signature,
    dedupeKey: dedupeKey(type, policy, signature),
  });
}

/**
 * Turn one decoded program event into database rows and alerts.
 *
 * The event is validated and normalized first, so a renamed or missing field
 * fails with a message naming it. Any failure is logged with its event name and
 * signature and swallowed: a bad event must never stop the watcher or the
 * events queued behind it.
 */
export async function handleEvent(event: DecodedEvent, signature: string): Promise<void> {
  if (!KNOWN_EVENTS.has(event.name)) {
    console.warn(`[watcher] ignoring unknown event "${event.name}" in ${signature}`);
    return;
  }

  try {
    const normalized = normalizeEvent(event);
    switch (normalized.name) {
      case "PolicyInitialized":
        await handlePolicyInitialized(normalized);
        return;
      case "PaymentExecuted":
        await handlePaymentExecuted(normalized, signature);
        return;
      case "WithdrawRequested":
        await handleWithdrawRequested(normalized, signature);
        return;
      case "WithdrawExecuted":
        await handleWithdrawExecuted(normalized, signature);
        return;
      case "WithdrawCancelled":
        await handleWithdrawCancelled(normalized, signature);
        return;
      case "RecipientAdded":
        await handleRecipientAdded(normalized, signature);
        return;
      case "PausedChanged":
        await handlePausedChanged(normalized, signature);
        return;
    }
  } catch (err: unknown) {
    console.error(
      `[watcher] failed to handle ${event.name} in ${signature}: ${errorMessage(err)}`,
    );
  }
}

function clampBackfillLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_BACKFILL_LIMIT;
  }
  return Math.max(1, Math.min(MAX_BACKFILL_LIMIT, Math.floor(limit)));
}

/**
 * Shared backfill loop. `processEvent` lets the watcher serialize backfilled
 * events behind live ones; the exported `backfillRecent` uses `handleEvent`.
 */
async function backfill(
  limit: number,
  processEvent: (event: DecodedEvent, signature: string) => Promise<void>,
): Promise<void> {
  const connection = getConnection();
  const programId = loadConfig().programId;
  const parser = createEventParser(programId);
  const capped = clampBackfillLimit(limit);

  const signatures = await connection.getSignaturesForAddress(
    programId,
    { limit: capped },
    "confirmed",
  );

  // getSignaturesForAddress is newest first. Payments must be processed oldest
  // first so each one's recipient statistics describe only earlier payments.
  const oldestFirst = [...signatures].reverse();
  console.log(`[watcher] backfilling ${oldestFirst.length} recent transactions`);

  for (const info of oldestFirst) {
    // A failed transaction has no committed events, even if logs survive.
    if (info.err !== null) {
      continue;
    }

    try {
      const transaction = await connection.getTransaction(info.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (transaction === null) {
        console.warn(`[watcher] backfill: transaction ${info.signature} not found`);
        continue;
      }

      const logs = transaction.meta?.logMessages ?? [];
      if (logs.length === 0) {
        continue;
      }

      for (const decoded of parser.parseLogs(logs)) {
        await processEvent(decoded, info.signature);
      }
    } catch (err: unknown) {
      // One malformed transaction or RPC hiccup must not abort the backfill.
      console.error(
        `[watcher] backfill failed for ${info.signature}: ${errorMessage(err)}`,
      );
    }
  }
}

/**
 * Read recent program transactions and replay their events through
 * `handleEvent`. Runs at watcher startup and after every reconnect, so events
 * emitted while the websocket was down are not lost. Replays are idempotent:
 * `payments.signature`, the alert `dedupe_key` and `upsertPolicy` all ignore
 * duplicates.
 */
export async function backfillRecent(limit: number = DEFAULT_BACKFILL_LIMIT): Promise<void> {
  await backfill(limit, handleEvent);
}

export interface WatcherOptions {
  backfillLimit?: number;
  healthCheckIntervalMs?: number;
}

export interface WatcherHandle {
  stop(): Promise<void>;
}

/** The private web3.js socket emitter, used only to observe open/close. */
interface WebSocketLifecycle {
  on(event: "open" | "close", listener: () => void): void;
  off?(event: "open" | "close", listener: () => void): void;
}

function getWebSocketLifecycle(connection: Connection): WebSocketLifecycle | null {
  const candidate = (connection as unknown as { _rpcWebSocket?: unknown })._rpcWebSocket;
  if (candidate === null || typeof candidate !== "object") {
    return null;
  }
  const maybe = candidate as Partial<WebSocketLifecycle>;
  return typeof maybe.on === "function" ? (candidate as WebSocketLifecycle) : null;
}

/**
 * Start the watcher: backfill, then subscribe to the program's logs.
 *
 * web3.js already reconnects its websocket and replays active subscriptions;
 * the `close`/`open` hooks below add the piece it cannot know about — replaying
 * the transactions missed while the socket was down. A watchdog rebuilds the
 * subscription if the socket stays down or the RPC health check fails.
 *
 * Never throws for RPC problems: alerts are important but must not prevent the
 * HTTP server from starting (hard rule 9).
 */
export async function startWatcher(options: WatcherOptions = {}): Promise<WatcherHandle> {
  const config = loadConfig();
  const connection = getConnection();
  const parser = createEventParser(config.programId);
  const backfillLimit = options.backfillLimit ?? DEFAULT_BACKFILL_LIMIT;

  let stopped = false;
  let subscriptionId: number | null = null;
  let queue: Promise<void> = Promise.resolve();
  let wsDownSince: number | null = null;
  let recovering = false;
  let retryTimer: NodeJS.Timeout | null = null;
  let watchdog: NodeJS.Timeout | null = null;

  // Live events are buffered while a backfill runs, then flushed afterwards so
  // the overall processing order stays "older backfilled events, then live".
  let buffered: Array<{ event: DecodedEvent; signature: string }> | null = null;

  const enqueue = (event: DecodedEvent, signature: string): Promise<void> => {
    const next = queue.then(() => handleEvent(event, signature));
    // `handleEvent` never rejects, but keep the queue alive if that changes.
    queue = next.catch((err: unknown) => {
      console.error(`[watcher] queue error: ${errorMessage(err)}`);
    });
    return next;
  };

  const dispatch = (event: DecodedEvent, signature: string): void => {
    if (buffered !== null) {
      buffered.push({ event, signature });
      return;
    }
    void enqueue(event, signature);
  };

  const beginBuffering = (): void => {
    buffered = [];
  };

  const endBuffering = (): void => {
    const events = buffered ?? [];
    buffered = null;
    for (const item of events) {
      void enqueue(item.event, item.signature);
    }
  };

  const subscribe = (): void => {
    if (stopped || subscriptionId !== null) {
      return;
    }
    try {
      subscriptionId = connection.onLogs(
        config.programId,
        (logs, _context) => {
          if (logs.err !== null) {
            return;
          }
          try {
            for (const decoded of parser.parseLogs(logs.logs)) {
              dispatch(decoded, logs.signature);
            }
          } catch (err: unknown) {
            console.error(
              `[watcher] failed to decode logs for ${logs.signature}: ${errorMessage(err)}`,
            );
          }
        },
        "confirmed",
      );
      console.log(
        `[watcher] subscribed to ${config.programId.toBase58()} (id ${subscriptionId})`,
      );
    } catch (err: unknown) {
      console.error(`[watcher] subscribe failed: ${errorMessage(err)}`);
      wsDownSince ??= Date.now();
    }
  };

  const unsubscribe = async (): Promise<void> => {
    if (subscriptionId === null) {
      return;
    }
    const id = subscriptionId;
    subscriptionId = null;
    try {
      await connection.removeOnLogsListener(id);
    } catch (err: unknown) {
      // The socket may already be gone; there is nothing left to remove.
      console.warn(`[watcher] could not remove log listener ${id}: ${errorMessage(err)}`);
    }
  };

  const recover = async (reason: string): Promise<void> => {
    if (stopped || recovering) {
      return;
    }
    recovering = true;
    console.warn(`[watcher] recovering (${reason})`);
    try {
      await unsubscribe();
      beginBuffering();
      subscribe();
      await backfill(backfillLimit, enqueue);
      wsDownSince = null;
    } catch (err: unknown) {
      console.error(`[watcher] recovery failed: ${errorMessage(err)}`);
      if (!stopped && retryTimer === null) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void recover("retry after failure");
        }, RECONNECT_RETRY_MS);
      }
    } finally {
      endBuffering();
      recovering = false;
    }
  };

  // Startup: subscribe first, buffer live events, backfill, then flush. Any
  // backfill failure is logged and the live subscription still runs.
  beginBuffering();
  subscribe();
  try {
    await backfill(backfillLimit, enqueue);
  } catch (err: unknown) {
    console.error(`[watcher] startup backfill failed: ${errorMessage(err)}`);
  } finally {
    endBuffering();
  }

  const socket = getWebSocketLifecycle(connection);
  const onClose = (): void => {
    wsDownSince = Date.now();
    console.warn("[watcher] websocket closed; waiting for reconnection");
  };
  const onOpen = (): void => {
    if (wsDownSince === null) {
      return;
    }
    wsDownSince = null;
    console.log("[watcher] websocket reopened; backfilling missed events");
    void recover("websocket reopened");
  };

  if (socket !== null) {
    socket.on("close", onClose);
    socket.on("open", onOpen);
  } else {
    console.warn("[watcher] websocket lifecycle hooks unavailable; relying on the watchdog");
  }

  const healthCheck = async (): Promise<void> => {
    if (stopped || recovering) {
      return;
    }

    if (subscriptionId === null) {
      void recover("subscription is not active");
      return;
    }

    const connected = (connection as unknown as { _rpcWebSocketConnected?: boolean })
      ._rpcWebSocketConnected;
    if (
      connected === false &&
      wsDownSince !== null &&
      Date.now() - wsDownSince >= WS_STUCK_MS
    ) {
      void recover("websocket stayed down");
      return;
    }

    try {
      await connection.getSlot("confirmed");
    } catch (err: unknown) {
      console.error(`[watcher] RPC health check failed: ${errorMessage(err)}`);
      void recover("RPC health check failed");
    }
  };

  watchdog = setInterval(() => {
    void healthCheck();
  }, options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_MS);

  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;

    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (watchdog !== null) {
      clearInterval(watchdog);
      watchdog = null;
    }
    if (socket !== null) {
      socket.off?.("close", onClose);
      socket.off?.("open", onOpen);
    }

    await unsubscribe();
    await queue;
    console.log("[watcher] stopped");
  };

  return { stop };
}
