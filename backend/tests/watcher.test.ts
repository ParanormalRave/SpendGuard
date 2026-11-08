import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  closeDb,
  getDb,
  initDb,
  listAlerts,
  savePayment,
  upsertPolicy,
} from "../src/db";
import { handleEvent, normalizeEvent, type DecodedEvent } from "../src/watcher";

/**
 * Watcher tests use a throwaway SQLite file and seeded `policies` rows, so no
 * RPC or keypair is touched. The chain-facing pieces (`onLogs`, backfill) are
 * exercised against devnet manually; these tests pin the event → alert rules.
 */

// `detectAnomalies` reads its thresholds through `loadConfig`, which requires
// these values. Provided here so the suite works from a fresh clone with no
// backend/.env.
process.env.RPC_URL ??= "http://127.0.0.1:8899";
process.env.PROGRAM_ID ??= "AzvuWQBBrawzLRFYkH7DiCY4c9326cnncJWGkySnEsEZ";
process.env.AGENT_KEYPAIR_PATH ??= "./keys/agent-keypair.json";
process.env.UNUSUAL_MULTIPLIER ??= "3";
process.env.UNUSUAL_MIN_HISTORY ??= "3";
process.env.NEAR_LIMIT_PERCENT ??= "80";

const dbPath = path.join(os.tmpdir(), `spendguard-watcher-${process.pid}.db`);

before(() => {
  closeDb();
  initDb(dbPath);
});

after(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

beforeEach(() => {
  const db = initDb();
  db.exec("DELETE FROM payments; DELETE FROM alerts; DELETE FROM policies;");
});

const WINDOW_LIMIT = 1_000_000;

function seedPolicy(owner?: PublicKey, agent?: PublicKey): string {
  const policy = Keypair.generate().publicKey.toBase58();
  upsertPolicy(getDb(), {
    address: policy,
    owner: (owner ?? Keypair.generate().publicKey).toBase58(),
    agent: (agent ?? Keypair.generate().publicKey).toBase58(),
    policyId: "1",
  });
  return policy;
}

function paymentEvent(
  policy: string,
  recipient: PublicKey,
  amountLamports: number,
  spentInWindow: number,
  windowLimit: number = WINDOW_LIMIT,
  timestamp = 1_700_000_000,
): DecodedEvent {
  return {
    name: "PaymentExecuted",
    data: {
      policy: new PublicKey(policy),
      recipient,
      amount: new BN(amountLamports),
      spent_in_window: new BN(spentInWindow),
      window_limit: new BN(windowLimit),
      timestamp: new BN(timestamp),
    },
  };
}

function alertTypes(policy: string): string[] {
  return listAlerts(getDb(), { policy }).map((alert) => alert.type);
}

function paymentCount(policy: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM payments WHERE policy = ?")
    .get(policy) as { count: number };
  return Number(row.count);
}

describe("handleEvent: PaymentExecuted", () => {
  it("saves the payment and raises NEW_RECIPIENT_PAYMENT for a first payment", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;

    await handleEvent(paymentEvent(policy, recipient, 5_000, 5_000), "sig-1");

    assert.equal(paymentCount(policy), 1);

    const alerts = listAlerts(getDb(), { policy });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.type, "NEW_RECIPIENT_PAYMENT");
    assert.equal(alerts[0]!.severity, "warning");
    const data = alerts[0]!.data as { recipient: string; amountLamports: number };
    assert.equal(data.recipient, recipient.toBase58());
    assert.equal(data.amountLamports, 5_000);
  });

  it("does not duplicate payments or alerts when an event is replayed", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;
    const event = paymentEvent(policy, recipient, 5_000, 5_000);

    await handleEvent(event, "sig-replay");
    await handleEvent(event, "sig-replay");

    assert.equal(paymentCount(policy), 1);
    assert.deepEqual(alertTypes(policy), ["NEW_RECIPIENT_PAYMENT"]);
  });

  it("reads earlier stats before saving, then raises UNUSUAL_AMOUNT", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;

    // Three earlier payments of 100 lamports: average 100.
    for (let i = 0; i < 3; i += 1) {
      savePayment(getDb(), {
        signature: `earlier-${i}`,
        policy,
        recipient: recipient.toBase58(),
        amount_lamports: 100,
        timestamp: 1_699_999_000 + i,
      });
    }

    await handleEvent(paymentEvent(policy, recipient, 1_000, 1_300), "sig-unusual");

    const types = alertTypes(policy);
    assert.deepEqual(types, ["UNUSUAL_AMOUNT"]);
    assert.equal(paymentCount(policy), 4);
  });

  it("raises NEAR_WINDOW_LIMIT at exactly the configured percentage", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;

    // One earlier payment so the new one is not a new recipient.
    savePayment(getDb(), {
      signature: "earlier-near",
      policy,
      recipient: recipient.toBase58(),
      amount_lamports: 10,
      timestamp: 1_699_999_000,
    });

    // 80 of 100 is exactly 80%, the default threshold.
    await handleEvent(paymentEvent(policy, recipient, 10, 80, 100), "sig-near");

    assert.deepEqual(alertTypes(policy), ["NEAR_WINDOW_LIMIT"]);
  });

  it("logs and swallows a malformed amount instead of throwing", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;

    // Negative amounts are rejected by the conversion helper before RPC/DB work.
    await assert.doesNotReject(
      handleEvent(paymentEvent(policy, recipient, -1, -1), "sig-bad"),
    );

    assert.equal(paymentCount(policy), 0);
    assert.deepEqual(alertTypes(policy), []);
  });
});

describe("handleEvent: owner and withdrawal events", () => {
  it("raises a critical WITHDRAWAL_REQUESTED alert", async () => {
    const policy = seedPolicy();

    await handleEvent(
      {
        name: "WithdrawRequested",
        data: {
          policy: new PublicKey(policy),
          amount: new BN(2_000),
          unlock_at: new BN(1_700_001_800),
        },
      },
      "sig-withdraw-request",
    );

    const alerts = listAlerts(getDb(), { policy });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.type, "WITHDRAWAL_REQUESTED");
    assert.equal(alerts[0]!.severity, "critical");
  });

  it("normalizes unlock_at to a bigint (the decoded key, not unlockAt)", () => {
    const policy = Keypair.generate().publicKey;

    const normalized = normalizeEvent({
      name: "WithdrawRequested",
      data: {
        policy,
        amount: new BN(2_000),
        unlock_at: new BN(1_700_001_800),
      },
    });

    assert.equal(normalized.name, "WithdrawRequested");
    if (normalized.name !== "WithdrawRequested") {
      return;
    }
    assert.equal(normalized.amount, 2_000n);
    assert.equal(normalized.unlockAt, 1_700_001_800n);
  });

  it("names the missing field instead of crashing when the key is wrong", async () => {
    const policy = seedPolicy();

    await assert.doesNotReject(
      handleEvent(
        {
          name: "WithdrawRequested",
          data: {
            policy: new PublicKey(policy),
            amount: new BN(2_000),
            unlockAt: new BN(1_700_001_800), // camelCase: not the decoded key
          },
        },
        "sig-wrong-key",
      ),
    );

    assert.deepEqual(alertTypes(policy), []);

    assert.throws(
      () =>
        normalizeEvent({
          name: "WithdrawRequested",
          data: {
            policy: new PublicKey(policy),
            amount: new BN(2_000),
            unlockAt: new BN(1_700_001_800),
          },
        }),
      /missing field "unlock_at"/,
    );
  });

  it("raises WITHDRAWAL_EXECUTED as warning and WITHDRAWAL_CANCELLED as info", async () => {
    const policy = seedPolicy();
    const owner = Keypair.generate().publicKey;

    await handleEvent(
      {
        name: "WithdrawExecuted",
        data: {
          policy: new PublicKey(policy),
          owner,
          amount: new BN(2_000),
        },
      },
      "sig-withdraw-execute",
    );

    await handleEvent(
      { name: "WithdrawCancelled", data: { policy: new PublicKey(policy) } },
      "sig-withdraw-cancel",
    );

    const alerts = listAlerts(getDb(), { policy });
    const byType = new Map(alerts.map((alert) => [alert.type, alert.severity]));
    assert.equal(byType.get("WITHDRAWAL_EXECUTED"), "warning");
    assert.equal(byType.get("WITHDRAWAL_CANCELLED"), "info");
  });
});

describe("handleEvent: policy events", () => {
  it("raises RECIPIENT_ADDED as a warning", async () => {
    const policy = seedPolicy();
    const recipient = Keypair.generate().publicKey;

    await handleEvent(
      {
        name: "RecipientAdded",
        data: { policy: new PublicKey(policy), recipient },
      },
      "sig-recipient",
    );

    const alerts = listAlerts(getDb(), { policy });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.type, "RECIPIENT_ADDED");
    assert.equal(alerts[0]!.severity, "warning");
  });

  it("maps PausedChanged to POLICY_PAUSED or POLICY_RESUMED at info severity", async () => {
    const policy = seedPolicy();

    await handleEvent(
      { name: "PausedChanged", data: { policy: new PublicKey(policy), paused: true } },
      "sig-paused",
    );
    await handleEvent(
      { name: "PausedChanged", data: { policy: new PublicKey(policy), paused: false } },
      "sig-resumed",
    );

    const alerts = listAlerts(getDb(), { policy });
    const byType = new Map(alerts.map((alert) => [alert.type, alert.severity]));
    assert.equal(byType.get("POLICY_PAUSED"), "info");
    assert.equal(byType.get("POLICY_RESUMED"), "info");
  });

  it("ignores an unknown event name without throwing", async () => {
    await assert.doesNotReject(
      handleEvent({ name: "SomethingElse", data: {} }, "sig-unknown"),
    );
  });
});
