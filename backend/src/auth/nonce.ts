import { getDb } from "../db";
import * as db from "../db";

export function createNonce(wallet: string, nowMs?: number): { nonce: string; message: string; expiresAt: number };
export function createNonce(dbArg: unknown, wallet: string, nowMs?: number): { nonce: string; message: string; expiresAt: number };
export function createNonce(...args: unknown[]): { nonce: string; message: string; expiresAt: number } {
  if (args.length === 3 || (args.length === 2 && typeof args[0] !== "string")) {
    const d = args[0] as never;
    const w = args[1] as string;
    const n = args[2] as number | undefined;
    return db.createNonce(d, w, n);
  }
  const w = args[0] as string;
  const n = args[1] as number | undefined;
  return db.createNonce(getDb(), w, n);
}

export function consumeNonce(wallet: string, nonce: string, nowMs?: number): boolean;
export function consumeNonce(dbArg: unknown, wallet: string, nonce: string, nowMs?: number): boolean;
export function consumeNonce(...args: unknown[]): boolean {
  if (args.length >= 3 && typeof args[0] !== "string") {
    const d = args[0] as never;
    const w = args[1] as string;
    const n = args[2] as string;
    const t = args[3] as number | undefined;
    return db.consumeNonce(d, w, n, t);
  }
  if (args.length === 3 && typeof args[0] === "string") {
    const w = args[0] as string;
    const n = args[1] as string;
    const t = args[2] as number | undefined;
    return db.consumeNonce(getDb(), w, n, t);
  }
  const w = args[0] as string;
  const n = args[1] as string;
  return db.consumeNonce(getDb(), w, n);
}

export function getNonceMessage(wallet: string, nonce: string): string | null;
export function getNonceMessage(dbArg: unknown, wallet: string, nonce: string): string | null;
export function getNonceMessage(...args: unknown[]): string | null {
  if (args.length === 3) {
    const d = args[0] as never;
    const w = args[1] as string;
    const n = args[2] as string;
    return db.getNonceMessage(d, w, n);
  }
  const w = args[0] as string;
  const n = args[1] as string;
  return db.getNonceMessage(getDb(), w, n);
}
