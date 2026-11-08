// Tests for src/anomaly/detectAnomalies.ts
// Required export:
//   detectAnomalies(input, config): Array<{
//     type: 'NEW_RECIPIENT_PAYMENT' | 'UNUSUAL_AMOUNT' | 'NEAR_WINDOW_LIMIT';
//     severity: 'warning'; title: string; message: string }>
//   input  = { amountLamports: bigint,
//              recipientStats: { count: number; averageLamports: bigint }, // EARLIER payments only
//              spentInWindowAfter: bigint, windowLimit: bigint }
//   config = { unusualMultiplier: number, unusualMinHistory: number, nearLimitPercent: number }
//            (all whole numbers)
// Rules: all comparisons use exact bigint maths, no floating point.
//   NEW_RECIPIENT_PAYMENT: recipientStats.count === 0
//   UNUSUAL_AMOUNT:        count >= unusualMinHistory AND amount > average * unusualMultiplier
//   NEAR_WINDOW_LIMIT:     spentInWindowAfter * 100 >= windowLimit * nearLimitPercent
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies } from './detectAnomalies';

type Input = Parameters<typeof detectAnomalies>[0];

const SOL = 1_000_000_000n;
const config = { unusualMultiplier: 3, unusualMinHistory: 3, nearLimitPercent: 80 };

const input = (over: Partial<Input> = {}): Input => ({
  amountLamports: SOL / 100n,
  recipientStats: { count: 5, averageLamports: SOL / 100n },
  spentInWindowAfter: SOL / 100n,
  windowLimit: 10n * SOL,
  ...over,
});

const types = (i: Input, c = config) =>
  detectAnomalies(i, c)
    .map((a) => a.type)
    .sort();

test('a normal payment raises nothing', () => {
  assert.deepEqual(types(input()), []);
});

test('first payment to a recipient raises NEW_RECIPIENT_PAYMENT only', () => {
  const i = input({ recipientStats: { count: 0, averageLamports: 0n } });
  assert.deepEqual(types(i), ['NEW_RECIPIENT_PAYMENT']);
});

test('with too little history a huge amount is not flagged as unusual', () => {
  const i = input({
    amountLamports: SOL,
    recipientStats: { count: 2, averageLamports: SOL / 100n },
    spentInWindowAfter: SOL,
  });
  assert.deepEqual(types(i), []);
});

test('exactly 3x the average is not unusual, just above is', () => {
  const average = 10_000_000n;
  const stats = { count: 3, averageLamports: average };
  assert.deepEqual(types(input({ amountLamports: average * 3n, recipientStats: stats })), []);
  assert.deepEqual(types(input({ amountLamports: average * 3n + 1n, recipientStats: stats })), ['UNUSUAL_AMOUNT']);
});

test('near the window limit triggers at exactly 80 percent, not below', () => {
  assert.deepEqual(types(input({ spentInWindowAfter: 8n * SOL })), ['NEAR_WINDOW_LIMIT']);
  assert.deepEqual(types(input({ spentInWindowAfter: 8n * SOL - 1n })), []);
});

test('the window check stays exact beyond the safe integer range', () => {
  const windowLimit = 10n ** 18n;
  const eighty = 8n * 10n ** 17n;
  assert.deepEqual(types(input({ windowLimit, spentInWindowAfter: eighty })), ['NEAR_WINDOW_LIMIT']);
  assert.deepEqual(types(input({ windowLimit, spentInWindowAfter: eighty - 1n })), []);
});

test('the percentage comes from the config', () => {
  const half = { ...config, nearLimitPercent: 50 };
  assert.deepEqual(types(input({ spentInWindowAfter: 5n * SOL }), half), ['NEAR_WINDOW_LIMIT']);
  assert.deepEqual(types(input({ spentInWindowAfter: 5n * SOL - 1n }), half), []);
});

test('several anomalies can be raised for one payment', () => {
  const i = input({
    recipientStats: { count: 0, averageLamports: 0n },
    spentInWindowAfter: 9n * SOL,
  });
  assert.deepEqual(types(i), ['NEAR_WINDOW_LIMIT', 'NEW_RECIPIENT_PAYMENT']);
});

test('every alert is a warning with a title and a message', () => {
  const alerts = detectAnomalies(
    input({ recipientStats: { count: 0, averageLamports: 0n }, spentInWindowAfter: 9n * SOL }),
    config,
  );
  assert.ok(alerts.length > 0);
  for (const alert of alerts) {
    assert.equal(alert.severity, 'warning');
    assert.ok(alert.title.length > 0);
    assert.ok(alert.message.length > 0);
  }
});
