// Tests for src/lib/money.ts (the backend and frontend must use an identical copy)
// Required exports:
//   solToLamports(sol: string): bigint     // strict decimal string, at most 9 decimals, within u64
//   lamportsToSol(lamports: bigint): string // no trailing zeros, never uses floating point
// Implementation hint: validate with /^\d+(\.\d{1,9})?$/ and use BigInt only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solToLamports, lamportsToSol } from './money';

const SOL = 1_000_000_000n;
const U64_MAX = 18_446_744_073_709_551_615n;

test('solToLamports converts exactly, including floating point traps', () => {
  const cases: Array<[string, bigint]> = [
    ['1', SOL],
    ['0.1', 100_000_000n],
    ['0.02', 20_000_000n],
    ['0.3', 300_000_000n],
    ['1.005', 1_005_000_000n],
    ['8.2', 8_200_000_000n],
    ['0.000000001', 1n],
    ['1.123456789', 1_123_456_789n],
    ['0', 0n],
    ['1000000', 1_000_000n * SOL],
  ];
  for (const [input, expected] of cases) {
    assert.equal(solToLamports(input), expected, `input ${input}`);
  }
});

test('solToLamports rejects malformed input', () => {
  const bad = ['', ' ', '-1', '+1', '1e3', 'abc', '1.', '.5', '1.0000000001', '1,5', '0x10', '1 2', ' 1', '1 '];
  for (const value of bad) {
    assert.throws(() => solToLamports(value), Error, `should reject ${JSON.stringify(value)}`);
  }
});

test('solToLamports enforces the u64 range', () => {
  assert.equal(solToLamports('18446744073.709551615'), U64_MAX);
  assert.throws(() => solToLamports('18446744073.709551616'), Error);
});

test('lamportsToSol formats without trailing zeros', () => {
  const cases: Array<[bigint, string]> = [
    [0n, '0'],
    [1n, '0.000000001'],
    [20_000_000n, '0.02'],
    [100_000_000n, '0.1'],
    [1_500_000_000n, '1.5'],
    [SOL, '1'],
    [1_123_456_789n, '1.123456789'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(lamportsToSol(input), expected, `input ${input}`);
  }
});

test('lamportsToSol rejects negative values', () => {
  assert.throws(() => lamportsToSol(-1n), Error);
});

test('round trip keeps every value exact', () => {
  const values = [0n, 1n, 999_999_999n, SOL, 123_456_789_012n, U64_MAX];
  for (const value of values) {
    assert.equal(solToLamports(lamportsToSol(value)), value, `value ${value}`);
  }
});
