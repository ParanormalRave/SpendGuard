import { OAuth2Client } from "google-auth-library";
import { loadConfig } from "../config";

export async function verifyGoogleIdToken(idToken: string): Promise<{ email: string; googleSub: string }> {
  const config = loadConfig();
  const clientId = config.googleClientId;
  if (!clientId) throw new Error("Google sign-in is not configured");
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Invalid Google token");
  if (payload.aud !== clientId) throw new Error("Invalid Google token audience");
  if (!payload.email_verified) throw new Error("Email not verified");
  if (!payload.email || !payload.sub) throw new Error("Invalid Google token payload");
  return { email: payload.email, googleSub: payload.sub };
}
