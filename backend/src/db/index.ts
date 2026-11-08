import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let db: Database.Database | null = null;

function resolveDbPath(): string {
  // src/db/index.ts -> ../../data/spendguard.db  (works for tsx and compiled dist)
  return path.resolve(__dirname, "../../data/spendguard.db");
}

export interface LogAttemptInput {
  timestamp: number;
  scenario: string;
  policy: string;
  recipient: string;
  service_id?: string | null;
  amount_lamports: number;
  reason?: string | null;
  status: "success" | "rejected" | "error";
  error_code?: string | null;
  signature?: string | null;
}

export interface AttemptRow {
  id: number;
  timestamp: number;
  scenario: string;
  policy: string;
  recipient: string;
  service_id: string | null;
  amount_lamports: number;
  reason: string | null;
  status: string;
  error_code: string | null;
  signature: string | null;
}

/** One saved on-chain payment (written by the M5 watcher). */
export interface PaymentRow {
  signature: string;
  policy: string;
  recipient: string;
  amount_lamports: number;
  timestamp: number;
}

export interface SavePaymentInput {
  signature: string;
  policy: string;
  recipient: string;
  amount_lamports: number;
  timestamp: number;
}

/** What the anomaly rules need to know about a recipient's history. */
export interface RecipientStats {
  count: number;
  totalAmount: number;
  averageAmount: number;
}

export type AlertSeverity = "info" | "warning" | "critical";

/**
 * One alert. `dedupeKey` is the alert's identity: `UNIQUE(dedupe_key)` makes
 * repeated events and backfills silently skip.
 *
 * Convention:
 *   chain events:    `${type}:${policy}:${txSignature}`
 *   blocked payments `${type}:${policy}:${attemptId}` (no signature exists)
 */
export interface AlertInput {
  policy: string;
  owner: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Informational; null when the alert is about a payment that never sent. */
  txSignature?: string | null;
  /** Required and non-empty. Enforced by `createAlert`. */
  dedupeKey: string;
  /** ISO string; defaults to now. */
  createdAt?: string;
}

export interface ListAlertsParams {
  policy?: string;
  owner?: string;
  limit?: number;
}

/** Raw row shape inside this module. */
interface AlertRow {
  id: number;
  policy: string;
  owner: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  data_json: string;
  tx_signature: string | null;
  dedupe_key: string;
  created_at: number;
  emailed_at: number | null;
}

/** Opens the database, applies pragmas/schema/migrations. */
function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const instance = new Database(dbPath);
  // WAL for concurrent reads; foreign_keys for future use.
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");

  instance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      google_sub TEXT NOT NULL,
      wallet TEXT NOT NULL UNIQUE,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      min_severity TEXT NOT NULL DEFAULT 'info',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nonces (
      wallet TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, nonce)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      scenario TEXT NOT NULL,
      policy TEXT NOT NULL,
      recipient TEXT NOT NULL,
      service_id TEXT,
      amount_lamports INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      signature TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      signature TEXT PRIMARY KEY,
      policy TEXT NOT NULL,
      recipient TEXT NOT NULL,
      amount_lamports INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy TEXT NOT NULL,
      owner TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data_json TEXT NOT NULL,
      tx_signature TEXT,
      dedupe_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      emailed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS policies (
      address TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      agent TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_policy_timestamp ON attempts(policy, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_policy ON payments(policy);
    CREATE INDEX IF NOT EXISTS idx_alerts_policy ON alerts(policy);
  `);

  migrateAlerts(instance);
  return instance;
}

/**
 * Adds `dedupe_key` to databases created before it existed.
 *
 * `CREATE TABLE IF NOT EXISTS` cannot change an existing table, so older dev
 * databases get the column here, backfilled with the old (policy, type,
 * tx_signature) identity, then the unique index is created either way.
 */
function migrateAlerts(instance: Database.Database): void {
  const columns = instance.prepare("PRAGMA table_info(alerts)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "dedupe_key")) {
    instance.exec("ALTER TABLE alerts ADD COLUMN dedupe_key TEXT");
    instance.exec(`
      UPDATE alerts
      SET dedupe_key = type || ':' || policy || ':' || COALESCE(tx_signature, CAST(id AS TEXT))
      WHERE dedupe_key IS NULL
    `);
  }
  instance.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_dedupe_key ON alerts(dedupe_key)",
  );
}

/**
 * Opens (and creates) backend/data/spendguard.db and ensures all tables
 * from AGENTS.md §6 exist. Idempotent for file paths — safe to call on every
 * startup.
 *
 * `':memory:'` always returns a fresh, isolated database (used by tests) and
 * never becomes the production singleton.
 */
export function initDb(dbPath: string = resolveDbPath()): Database.Database {
  if (dbPath === ":memory:") {
    return openDatabase(":memory:");
  }
  if (db !== null) {
    return db;
  }
  db = openDatabase(dbPath);
  return db;
}

/** The one shared handle production code should pass to every db function. */
export function getDb(): Database.Database {
  return db ?? initDb();
}

/**
 * For tests: close and reset the singleton so a fresh DB can be opened.
 */
export function closeDb(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}

/**
 * Insert one attempt. Every payment try — success, rejected, error — must be logged.
 */
export function logAttempt(db: Database.Database, attempt: LogAttemptInput): number {
  const stmt = db.prepare(`
    INSERT INTO attempts
      (timestamp, scenario, policy, recipient, service_id, amount_lamports, reason, status, error_code, signature)
    VALUES
      (@timestamp, @scenario, @policy, @recipient, @service_id, @amount_lamports, @reason, @status, @error_code, @signature)
  `);
  const result = stmt.run({
    timestamp: attempt.timestamp,
    scenario: attempt.scenario,
    policy: attempt.policy,
    recipient: attempt.recipient,
    service_id: attempt.service_id ?? null,
    amount_lamports: attempt.amount_lamports,
    reason: attempt.reason ?? null,
    status: attempt.status,
    error_code: attempt.error_code ?? null,
    signature: attempt.signature ?? null,
  });
  return Number(result.lastInsertRowid);
}

/**
 * Read recent attempts, newest first.
 */
export function readAttempts(db: Database.Database, limit = 100): AttemptRow[] {
  const capped = Math.max(1, Math.min(1000, Math.floor(limit)));
  const stmt = db.prepare(`
    SELECT id, timestamp, scenario, policy, recipient, service_id, amount_lamports, reason, status, error_code, signature
    FROM attempts
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `);
  return stmt.all(capped) as AttemptRow[];
}

/**
 * Payment history for one policy, newest first.
 *
 * Rows are written by the watcher's `savePayment` (M5); until it runs this is
 * empty, which is honest rather than serving attempt-log rows as payments.
 */
export function readPayments(
  db: Database.Database,
  policy: string,
  limit = 100,
): PaymentRow[] {
  const capped = Math.max(1, Math.min(1000, Math.floor(limit)));
  const stmt = db.prepare(`
    SELECT signature, policy, recipient, amount_lamports, timestamp
    FROM payments
    WHERE policy = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(policy, capped) as PaymentRow[];
}

/**
 * Store one on-chain payment. `signature` is the primary key, so replays and
 * watcher backfills are naturally idempotent.
 *
 * Returns `true` when a new row was inserted, `false` for a duplicate.
 */
export function savePayment(db: Database.Database, payment: SavePaymentInput): boolean {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO payments
      (signature, policy, recipient, amount_lamports, timestamp)
    VALUES
      (@signature, @policy, @recipient, @amount_lamports, @timestamp)
  `);
  const result = stmt.run({
    signature: payment.signature,
    policy: payment.policy,
    recipient: payment.recipient,
    amount_lamports: payment.amount_lamports,
    timestamp: payment.timestamp,
  });
  return result.changes > 0;
}

/**
 * Earlier payments to one recipient under one policy.
 *
 * `averageAmount` is an integer floor (money stays in lamports, never floats);
 * `totalAmount` is returned too so anomaly rules can avoid rounding entirely.
 */
export function getRecipientStats(
  db: Database.Database,
  policy: string,
  recipient: string,
): RecipientStats {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count, COALESCE(SUM(amount_lamports), 0) AS total
      FROM payments
      WHERE policy = ? AND recipient = ?
    `,
    )
    .get(policy, recipient) as { count: number; total: number };

  const count = Number(row.count);
  const totalAmount = Number(row.total);
  return {
    count,
    totalAmount,
    averageAmount: count === 0 ? 0 : Math.floor(totalAmount / count),
  };
}

/**
 * Insert one alert. `UNIQUE(dedupe_key)` makes repeated events and backfills
 * silently skip, so the watcher needs no de-dup logic.
 *
 * Returns `true` when inserted, `false` when the key already existed.
 * Throws before touching the database when `dedupeKey` is empty or missing.
 */
export function createAlert(db: Database.Database, alert: AlertInput): boolean {
  if (typeof alert.dedupeKey !== "string" || alert.dedupeKey.trim() === "") {
    throw new Error("Alert requires a non-empty dedupeKey");
  }

  const createdAt = alert.createdAt === undefined ? Date.now() : Date.parse(alert.createdAt);
  if (!Number.isFinite(createdAt)) {
    throw new Error(`Invalid alert createdAt: ${JSON.stringify(alert.createdAt)}`);
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (policy, owner, type, severity, title, message, data_json, tx_signature, dedupe_key, created_at)
    VALUES
      (@policy, @owner, @type, @severity, @title, @message, @data_json, @tx_signature, @dedupe_key, @created_at)
  `);
  const result = stmt.run({
    policy: alert.policy,
    owner: alert.owner,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    data_json: JSON.stringify(alert.data ?? {}),
    tx_signature: alert.txSignature ?? null,
    dedupe_key: alert.dedupeKey,
    created_at: createdAt,
  });

  return result.changes > 0;
}

/**
 * Alerts newest first, optionally filtered by policy and/or owner.
 */
export function listAlerts(
  db: Database.Database,
  filter: ListAlertsParams = {},
): AlertInput[] {
  const capped = Math.max(1, Math.min(1000, Math.floor(filter.limit ?? 100)));

  const where: string[] = [];
  const bindings: unknown[] = [];
  if (filter.policy !== undefined) {
    where.push("policy = ?");
    bindings.push(filter.policy);
  }
  if (filter.owner !== undefined) {
    where.push("owner = ?");
    bindings.push(filter.owner);
  }

  const stmt = db.prepare(`
    SELECT id, policy, owner, type, severity, title, message, data_json, tx_signature, dedupe_key, created_at, emailed_at
    FROM alerts
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `);

  const rows = stmt.all(...bindings, capped) as AlertRow[];
  return rows.map(toAlertInput);
}

function toAlertInput(row: AlertRow): AlertInput {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.data_json);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt or legacy data_json: keep an empty object rather than throwing.
  }

  return {
    policy: row.policy,
    owner: row.owner,
    type: row.type,
    severity: row.severity as AlertSeverity,
    title: row.title,
    message: row.message,
    data,
    txSignature: row.tx_signature,
    dedupeKey: row.dedupe_key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
