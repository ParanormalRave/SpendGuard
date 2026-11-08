import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";

// Mirrors the validation used in (app)/create/page.tsx for auto-fetched agent address
function isValidAgentPubkey(value: string, owner?: string | null): string | null {
  const v = value.trim();
  if (!v) return "Enter the agent wallet address";
  try {
    const pk = new PublicKey(v);
    if (pk.equals(PublicKey.default)) return "Agent cannot be the zero address";
    if (owner && pk.toBase58() === owner) return "Agent must be different from your wallet";
    return null;
  } catch {
    return "Invalid public key";
  }
}

describe("agent address validation (create wizard)", () => {
  it("accepts a valid base58 agent pubkey not equal to owner", () => {
    const owner = "Ash4EG3TyuNw9FqVjsZAnnVWCdBedbxpbFu1ALu1Paqy";
    const agent = "ERP144CTsvYsQUwuKnL4vCvXHPN7tSrCGyPGGm9vVRCg";
    assert.equal(isValidAgentPubkey(agent, owner), null);
  });
  it("rejects zero address", () => {
    assert.equal(isValidAgentPubkey(PublicKey.default.toBase58()), "Agent cannot be the zero address");
  });
  it("rejects agent equal to owner", () => {
    const owner = "Ash4EG3TyuNw9FqVjsZAnnVWCdBedbxpbFu1ALu1Paqy";
    assert.equal(isValidAgentPubkey(owner, owner), "Agent must be different from your wallet");
  });
  it("rejects invalid base58", () => {
    assert.equal(isValidAgentPubkey("not-a-key"), "Invalid public key");
  });
});
