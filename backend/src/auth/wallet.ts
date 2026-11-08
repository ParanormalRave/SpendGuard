import nacl from "tweetnacl";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import bs58 from "bs58";

export function verifyWalletSignature(wallet: string, message: string, signature: string): boolean {
  try {
    if (!wallet || !message || !signature) return false;
    const pubKey = bs58.decode(wallet);
    if (pubKey.length !== 32) return false;
    const sig = bs58.decode(signature);
    if (sig.length !== 64) return false;
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sig, pubKey);
  } catch {
    return false;
  }
}
