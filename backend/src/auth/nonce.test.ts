// Tests for src/auth/nonce.ts
// Required exports:
//   createNonce(db, wallet: string, nowMs?: number): { nonce: string; message: string; expiresAt: number }
//   consumeNonce(db, wallet: string, nonce: string, nowMs?: number): boolean
// Rules: a nonce lives 5 minutes (300000 ms), works once, only for the wallet it was issued to,
// and `message` (the text the wallet will sign) must contain the nonce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../db';
import { createNonce, consumeNonce } from './nonce';

const WALLET = 'Wallet1111111111111111111111111111111111111';
const OTHER = 'Wallet2222222222222222222222222222222222222';
const NOW = 1_000_000;
const FIVE_MINUTES = 300_000;

test('a nonce can be consumed once', () => {
  const db = initDb(':memory:');
  const { nonce } = createNonce(db, WALLET, NOW);
  assert.equal(consumeNonce(db, WALLET, nonce, NOW + 1000), true);
  assert.equal(consumeNonce(db, WALLET, nonce, NOW + 2000), false);
});

test('a nonce only works for the wallet it was issued to', () => {
  const db = initDb(':memory:');
  const { nonce } = createNonce(db, WALLET, NOW);
  assert.equal(consumeNonce(db, OTHER, nonce, NOW + 1000), false);
  assert.equal(consumeNonce(db, WALLET, nonce, NOW + 1000), true);
});

test('an unknown nonce is rejected', () => {
  const db = initDb(':memory:');
  assert.equal(consumeNonce(db, WALLET, 'does-not-exist', NOW), false);
});

test('a nonce expires after 5 minutes', () => {
  const db = initDb(':memory:');
  const early = createNonce(db, WALLET, NOW);
  assert.equal(early.expiresAt, NOW + FIVE_MINUTES);
  assert.equal(consumeNonce(db, WALLET, early.nonce, NOW + FIVE_MINUTES - 1), true);

  const late = createNonce(db, WALLET, NOW);
  assert.equal(consumeNonce(db, WALLET, late.nonce, NOW + FIVE_MINUTES + 1), false);
});

test('the message to sign contains the nonce and every nonce is different', () => {
  const db = initDb(':memory:');
  const a = createNonce(db, WALLET, NOW);
  const b = createNonce(db, WALLET, NOW);
  assert.ok(a.message.includes(a.nonce));
  assert.notEqual(a.nonce, b.nonce);
});
