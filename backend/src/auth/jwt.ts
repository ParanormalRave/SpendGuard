import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { loadConfig } from "../config";

function getSecret(): string {
  const secret = loadConfig().jwtSecret;
  if (!secret || secret.length < 32) throw new Error("Auth is not configured");
  return secret;
}

export function issueJwt(user: { wallet: string; email: string; googleSub: string }): string {
  const secret = getSecret();
  return jwt.sign({ wallet: user.wallet, email: user.email, sub: user.googleSub }, secret, { expiresIn: "24h" });
}

export interface AuthUser {
  wallet: string;
  email: string;
  sub: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    getSecret();
  } catch {
    res.status(503).json({ error: "Auth is not configured" });
    return;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const token = header.slice(7);
  try {
    const secret = getSecret();
    const payload = jwt.verify(token, secret) as AuthUser;
    (req as unknown as { user: AuthUser }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
