// Tests for src/auth/wallet.ts
// Required export:
//   verifyWalletSignature(wallet: string, message: string, signature: string): boolean
//   wallet = base58 public key, signature = base58 of the 64-byte detached ed25519 signature
//   over the UTF-8 bytes of `message`. Must return false (never throw) for anything invalid.
// Suggested libraries: tweetnacl and bs58.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { verifyWalletSignature } from './wallet';

const sign = (message: string, keyPair = nacl.sign.keyPair()) => {
  const signature = nacl.sign.detached(new TextEncoder().encode(message), keyPair.secretKey);
  return { wallet: bs58.encode(keyPair.publicKey), signature: bs58.encode(signature) };
};

test('accepts a valid signature', () => {
  const { wallet, signature } = sign('Link wallet. Nonce: abc123');
  assert.equal(verifyWalletSignature(wallet, 'Link wallet. Nonce: abc123', signature), true);
});

test('rejects a signature for a different message', () => {
  const { wallet, signature } = sign('Link wallet. Nonce: abc123');
  assert.equal(verifyWalletSignature(wallet, 'Link wallet. Nonce: abc124', signature), false);
});

test('rejects a signature made by a different wallet', () => {
  const alice = sign('hello');
  const bob = sign('hello');
  assert.equal(verifyWalletSignature(alice.wallet, 'hello', bob.signature), false);
});

test('returns false instead of throwing for malformed signatures', () => {
  const { wallet } = sign('hello');
  const bad = ['', 'not base58 !!', bs58.encode(new Uint8Array(10)), bs58.encode(new Uint8Array(64))];
  for (const signature of bad) {
    assert.equal(verifyWalletSignature(wallet, 'hello', signature), false);
  }
});

test('returns false instead of throwing for malformed wallets', () => {
  const { signature } = sign('hello');
  for (const wallet of ['', 'abc', 'not a wallet']) {
    assert.equal(verifyWalletSignature(wallet, 'hello', signature), false);
  }
});
