// Tests for GET /config/public derivation — must use same keypair as payment service
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { loadKeypair } from "./keypairs";
import { loadConfig } from "../config";

describe("agent public key (GET /config/public source)", () => {
  it("derives a valid base58 public key from AGENT_KEYPAIR_PATH", () => {
    const config = loadConfig();
    const kp = loadKeypair(config.agentKeypairPath);
    const pubkey = kp.publicKey.toBase58();
    // must round-trip via PublicKey and not be zero
    const parsed = new PublicKey(pubkey);
    assert.ok(!parsed.equals(PublicKey.default), "agent pubkey must not be zero");
    assert.equal(parsed.toBase58(), pubkey);
    // same keypair that payment-signing uses (getProgram path)
    // loadKeypair is cached — second call returns same instance/public key
    const kp2 = loadKeypair(config.agentKeypairPath);
    assert.equal(kp2.publicKey.toBase58(), pubkey);
  });

  it("does not expose secret key material via public key", () => {
    const config = loadConfig();
    const pubkey = loadKeypair(config.agentKeypairPath).publicKey.toBase58();
    // public key is 32 bytes base58 (43-44 chars), never 64-byte array
    assert.ok(pubkey.length >= 32 && pubkey.length <= 44);
    assert.ok(!pubkey.includes("[") && !pubkey.includes(","));
  });
});
