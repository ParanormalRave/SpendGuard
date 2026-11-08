// Tests for src/payments/errors.ts
// Required exports:
//   parseProgramError(err: unknown, errorMap?: Record<number, string>): string | null
//   classifyError(err: unknown, errorMap?: Record<number, string>):
//     { status: 'rejected' | 'error'; errorCode: string | null }
// A "program error" is anything the Solana program or Anchor itself rejected.
// Network failures and unknown shapes are plain 'error'. Neither function may ever throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgramError, classifyError } from './errors';

const anchorError = (code: string, number: number) => ({
  error: { errorCode: { code, number } },
});

test('reads the code from an AnchorError-shaped object', () => {
  assert.equal(parseProgramError(anchorError('ExceedsPerTxLimit', 6003)), 'ExceedsPerTxLimit');
});

test('framework errors such as ConstraintSeeds count as program errors too', () => {
  assert.equal(parseProgramError(anchorError('ConstraintSeeds', 2006)), 'ConstraintSeeds');
});

test('reads the code from simulation logs', () => {
  const err = {
    message: 'Simulation failed',
    logs: [
      'Program log: Instruction: AgentTransfer',
      'Program log: AnchorError thrown in programs/spendguard/src/lib.rs:120. Error Code: RecipientNotAllowed. Error Number: 6004. Error Message: Recipient is not allowed.',
      'Program X failed: custom program error: 0x1774',
    ],
  };
  assert.equal(parseProgramError(err), 'RecipientNotAllowed');
});

test('maps a raw custom program error number using an error map', () => {
  const map = { 6003: 'ExceedsPerTxLimit' };
  // 0x1773 is 6003
  assert.equal(parseProgramError({ message: 'failed: custom program error: 0x1773' }, map), 'ExceedsPerTxLimit');
  assert.equal(parseProgramError({ logs: ['Program X failed: custom program error: 0x1773'] }, map), 'ExceedsPerTxLimit');
});

test('returns null for a custom error number that is not in the map', () => {
  assert.equal(parseProgramError({ message: 'custom program error: 0x1' }, { 6003: 'ExceedsPerTxLimit' }), null);
  assert.equal(parseProgramError({ message: 'custom program error: 0x1773' }), null);
});

test('returns null for network errors and malformed input', () => {
  const bad: unknown[] = [
    new Error('fetch failed'),
    null,
    undefined,
    'boom',
    42,
    {},
    { error: {} },
    { logs: ['Program log: hello'] },
  ];
  for (const value of bad) {
    assert.equal(parseProgramError(value), null);
  }
});

test('never throws on circular objects', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- building a circular object for the test
  const circular: any = { name: 'x' };
  circular.self = circular;
  assert.equal(parseProgramError(circular), null);
});

test('classifyError marks program errors as rejected', () => {
  assert.deepEqual(classifyError(anchorError('Paused', 6001)), { status: 'rejected', errorCode: 'Paused' });
});

test('classifyError marks everything else as error', () => {
  assert.deepEqual(classifyError(new Error('fetch failed')), { status: 'error', errorCode: null });
  assert.deepEqual(classifyError(undefined), { status: 'error', errorCode: null });
});
