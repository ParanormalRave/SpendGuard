// Tests for src/db/index.ts (alerts part). Uses an in-memory SQLite database.
// Required exports:
//   initDb(path: string): Database          // creates all tables; ':memory:' must work
//   type AlertInput = {
//     policy: string; owner: string; type: string; severity: 'info' | 'warning' | 'critical';
//     title: string; message: string; data?: Record<string, unknown>;
//     txSignature?: string | null;           // informational only, may be null
//     dedupeKey: string;                     // REQUIRED, non-empty, UNIQUE in the table
//     createdAt?: string;                    // ISO string, defaults to now
//   }
//   createAlert(db, alert: AlertInput): boolean   // true if inserted, false if it was a duplicate
//   listAlerts(db, filter?: { policy?: string; owner?: string; limit?: number }): AlertInput[] // newest first
// Dedupe key convention:
//   chain events:    `${type}:${policy}:${txSignature}`
//   blocked payments (no signature exists): `${type}:${policy}:${attemptId}`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, createAlert, listAlerts } from './index';
import type { AlertInput } from './index';

const make = (over: Partial<AlertInput> = {}): AlertInput => ({
  policy: 'POLICY1',
  owner: 'OWNER1',
  type: 'WITHDRAWAL_REQUESTED',
  severity: 'critical',
  title: 'Withdrawal requested',
  message: 'A withdrawal was requested.',
  data: { amountLamports: '1000' },
  txSignature: 'sig1',
  dedupeKey: 'WITHDRAWAL_REQUESTED:POLICY1:sig1',
  createdAt: '2026-11-07T10:00:00.000Z',
  ...over,
});

test('a new alert is inserted and listed', () => {
  const db = initDb(':memory:');
  assert.equal(createAlert(db, make()), true);
  const rows = listAlerts(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'WITHDRAWAL_REQUESTED');
});

test('a duplicate dedupeKey is ignored', () => {
  const db = initDb(':memory:');
  assert.equal(createAlert(db, make()), true);
  assert.equal(createAlert(db, make()), false);
  assert.equal(listAlerts(db).length, 1);
});

test('one transaction can raise different alert types', () => {
  const db = initDb(':memory:');
  assert.equal(createAlert(db, make({ type: 'NEW_RECIPIENT_PAYMENT', dedupeKey: 'NEW_RECIPIENT_PAYMENT:POLICY1:sig9', txSignature: 'sig9' })), true);
  assert.equal(createAlert(db, make({ type: 'NEAR_WINDOW_LIMIT', dedupeKey: 'NEAR_WINDOW_LIMIT:POLICY1:sig9', txSignature: 'sig9' })), true);
  assert.equal(listAlerts(db).length, 2);
});

test('alerts without a signature still de-duplicate by dedupeKey', () => {
  const db = initDb(':memory:');
  const blocked = (attemptId: string) =>
    make({ type: 'PAYMENT_BLOCKED', txSignature: null, dedupeKey: `PAYMENT_BLOCKED:POLICY1:${attemptId}` });
  assert.equal(createAlert(db, blocked('attempt-1')), true);
  assert.equal(createAlert(db, blocked('attempt-2')), true);
  assert.equal(createAlert(db, blocked('attempt-1')), false);
  assert.equal(listAlerts(db).length, 2);
});

test('an empty or missing dedupeKey is rejected and nothing is stored', () => {
  const db = initDb(':memory:');
  assert.throws(() => createAlert(db, make({ dedupeKey: '' })), Error);
  assert.throws(() => createAlert(db, make({ dedupeKey: undefined as unknown as string })), Error);
  assert.equal(listAlerts(db).length, 0);
});

test('alerts are listed newest first', () => {
  const db = initDb(':memory:');
  createAlert(db, make({ dedupeKey: 'a', createdAt: '2026-11-07T10:00:00.000Z', title: 'older' }));
  createAlert(db, make({ dedupeKey: 'b', createdAt: '2026-11-07T11:00:00.000Z', title: 'newer' }));
  assert.deepEqual(listAlerts(db).map((a) => a.title), ['newer', 'older']);
});

test('listAlerts filters by policy and owner and respects the limit', () => {
  const db = initDb(':memory:');
  createAlert(db, make({ dedupeKey: 'a', policy: 'P1', owner: 'O1' }));
  createAlert(db, make({ dedupeKey: 'b', policy: 'P2', owner: 'O1' }));
  createAlert(db, make({ dedupeKey: 'c', policy: 'P2', owner: 'O2' }));
  assert.equal(listAlerts(db, { policy: 'P2' }).length, 2);
  assert.equal(listAlerts(db, { owner: 'O1' }).length, 2);
  assert.equal(listAlerts(db, { policy: 'P2', owner: 'O2' }).length, 1);
  assert.equal(listAlerts(db, { limit: 1 }).length, 1);
});
