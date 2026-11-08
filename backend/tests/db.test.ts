import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  closeDb,
  createAlert,
  getRecipientStats,
  initDb,
  listAlerts,
  savePayment,
} from "../src/db";
import { raiseAlert } from "../src/alerts";

/**
 * Throwaway SQLite file per run: `initDb` keeps a module-level singleton, so
 * every suite opens it once and truncates tables between cases.
 */

const dbPath = path.join(os.tmpdir(), `spendguard-test-${process.pid}.db`);

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
  // Fresh state per case without reopening the file.
  const db = initDb();
  db.exec("DELETE FROM payments; DELETE FROM alerts;");
});

describe("savePayment", () => {
  it("inserts a payment once and ignores a duplicate signature", () => {
    const payment = {
      signature: "sig-1",
      policy: "policy-1",
      recipient: "recipient-1",
      amount_lamports: 1_000,
      timestamp: 1_700_000_000_000,
    };

    assert.equal(savePayment(payment), true);
    assert.equal(savePayment(payment), false);

    const db = initDb();
    const row = db.prepare("SELECT COUNT(*) AS count FROM payments").get() as { count: number };
    assert.equal(row.count, 1);
  });
});

describe("getRecipientStats", () => {
  it("returns zeros for an unknown recipient", () => {
    assert.deepEqual(getRecipientStats("policy-1", "nobody"), {
      count: 0,
      totalAmount: 0,
      averageAmount: 0,
    });
  });

  it("counts and averages earlier payments as integer lamports", () => {
    for (const [index, amount] of [100, 200, 300].entries()) {
      savePayment({
        signature: `sig-${index}`,
        policy: "policy-1",
        recipient: "recipient-1",
        amount_lamports: amount,
        timestamp: 1_700_000_000_000 + index,
      });
    }

    assert.deepEqual(getRecipientStats("policy-1", "recipient-1"), {
      count: 3,
      totalAmount: 600,
      averageAmount: 200,
    });
  });

  it("floors the average and never returns a float", () => {
    for (const [index, amount] of [1, 2].entries()) {
      savePayment({
        signature: `sig-floor-${index}`,
        policy: "policy-1",
        recipient: "recipient-1",
        amount_lamports: amount,
        timestamp: 1_700_000_000_000 + index,
      });
    }

    const stats = getRecipientStats("policy-1", "recipient-1");
    assert.equal(stats.totalAmount, 3);
    assert.equal(stats.averageAmount, 1);
    assert.equal(Number.isInteger(stats.averageAmount), true);
  });

  it("scopes history to the policy and recipient", () => {
    savePayment({
      signature: "sig-a",
      policy: "policy-1",
      recipient: "recipient-1",
      amount_lamports: 500,
      timestamp: 1,
    });
    savePayment({
      signature: "sig-b",
      policy: "policy-1",
      recipient: "recipient-2",
      amount_lamports: 999,
      timestamp: 2,
    });
    savePayment({
      signature: "sig-c",
      policy: "policy-2",
      recipient: "recipient-1",
      amount_lamports: 999,
      timestamp: 3,
    });

    assert.deepEqual(getRecipientStats("policy-1", "recipient-1"), {
      count: 1,
      totalAmount: 500,
      averageAmount: 500,
    });
  });
});

describe("createAlert", () => {
  const base = {
    policy: "policy-1",
    owner: "owner-1",
    type: "PAYMENT_BLOCKED",
    severity: "critical" as const,
    title: "Blocked",
    message: "Recipient not allowed",
    data_json: JSON.stringify({ amountLamports: 42 }),
    tx_signature: "tx-1",
  };

  it("inserts once and silently ignores the unique key duplicate", () => {
    const first = createAlert(base);
    assert.ok(first !== null);
    assert.equal(first.type, "PAYMENT_BLOCKED");
    assert.equal(first.emailed_at, null);

    assert.equal(createAlert(base), null);

    const db = initDb();
    const row = db.prepare("SELECT COUNT(*) AS count FROM alerts").get() as { count: number };
    assert.equal(row.count, 1);
  });

  it("allows the same type with a different transaction", () => {
    assert.ok(createAlert(base) !== null);
    assert.ok(createAlert({ ...base, tx_signature: "tx-2" }) !== null);

    const db = initDb();
    const row = db.prepare("SELECT COUNT(*) AS count FROM alerts").get() as { count: number };
    assert.equal(row.count, 2);
  });
});

describe("listAlerts", () => {
  function seed(): void {
    createAlert({
      policy: "policy-1",
      owner: "owner-1",
      type: "POLICY_PAUSED",
      severity: "info",
      title: "Paused",
      message: "paused",
      data_json: "{}",
      tx_signature: "tx-1",
      created_at: 1_000,
    });
    createAlert({
      policy: "policy-1",
      owner: "owner-1",
      type: "WITHDRAWAL_REQUESTED",
      severity: "critical",
      title: "Withdrawal",
      message: "requested",
      data_json: "{}",
      tx_signature: "tx-2",
      created_at: 3_000,
    });
    createAlert({
      policy: "policy-2",
      owner: "owner-2",
      type: "RECIPIENT_ADDED",
      severity: "warning",
      title: "Recipient",
      message: "added",
      data_json: "{}",
      tx_signature: "tx-3",
      created_at: 2_000,
    });
  }

  it("returns alerts newest first", () => {
    seed();
    const alerts = listAlerts();
    assert.deepEqual(
      alerts.map((alert) => alert.tx_signature),
      ["tx-2", "tx-3", "tx-1"],
    );
  });

  it("filters by policy and owner", () => {
    seed();
    assert.deepEqual(
      listAlerts({ policy: "policy-1" }).map((alert) => alert.tx_signature),
      ["tx-2", "tx-1"],
    );
    assert.deepEqual(
      listAlerts({ owner: "owner-2" }).map((alert) => alert.tx_signature),
      ["tx-3"],
    );
  });

  it("clamps the limit", () => {
    seed();
    assert.equal(listAlerts({ limit: 1 }).length, 1);
    assert.equal(listAlerts({ limit: 0 }).length, 1);
    assert.equal(listAlerts({ limit: -5 }).length, 1);
    assert.equal(listAlerts({ limit: 5_000 }).length, 3);
  });
});

describe("raiseAlert", () => {
  const input = {
    policy: "policy-1",
    owner: "owner-1",
    type: "WITHDRAWAL_REQUESTED" as const,
    severity: "critical" as const,
    title: "Withdrawal requested",
    message: "0.1 SOL",
    data: { amountLamports: 100_000_000 },
    txSignature: "tx-raise-1",
  };

  it("stores the alert with serialised data", async () => {
    const row = await raiseAlert(input);
    assert.ok(row !== null);
    assert.equal(row.severity, "critical");
    assert.deepEqual(JSON.parse(row.data_json), { amountLamports: 100_000_000 });
  });

  it("returns null on a duplicate and stores nothing new", async () => {
    assert.ok((await raiseAlert(input)) !== null);
    assert.equal(await raiseAlert(input), null);
    assert.equal(listAlerts().length, 1);
  });

  it("rejects an unknown type or severity", async () => {
    await assert.rejects(
      () => raiseAlert({ ...input, type: "NOT_A_TYPE" as never, txSignature: "tx-bad-1" }),
      /Unknown alert type/,
    );
    await assert.rejects(
      () => raiseAlert({ ...input, severity: "fatal" as never, txSignature: "tx-bad-2" }),
      /Unknown alert severity/,
    );
  });

  it("requires a transaction signature", async () => {
    await assert.rejects(() => raiseAlert({ ...input, txSignature: "" }), /tx_signature/);
  });
});
