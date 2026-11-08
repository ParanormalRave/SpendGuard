import { BACKEND_URL } from "./env";

const TOKEN_KEY = "spendguard:jwt";

let memoryToken: string | null = null;

function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const v = sessionStorage.getItem(TOKEN_KEY);
    if (v) memoryToken = v;
    return v;
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getToken(): string | null {
  return getStoredToken();
}

export function setToken(token: string | null): void {
  setStoredToken(token);
}

export function clearToken(): void {
  setStoredToken(null);
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers });
}

export async function getAuthNonce(wallet: string): Promise<{ nonce: string; message: string; expiresAt: number }> {
  const res = await fetch(`${BACKEND_URL}/auth/nonce?wallet=${encodeURIComponent(wallet)}`);
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {}
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || body || `Failed (${res.status})`);
  return json as { nonce: string; message: string; expiresAt: number };
}

export async function linkGoogleAccount(params: { idToken: string; wallet: string; signature: string; nonce: string }): Promise<{ token: string; email: string }> {
  const res = await fetch(`${BACKEND_URL}/auth/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || text || `Failed (${res.status})`);
  const data = json as { token: string; email: string };
  setStoredToken(data.token);
  return data;
}

export async function fetchMe(): Promise<{ wallet: string; email: string; emailEnabled: boolean; minSeverity: string }> {
  const res = await authFetch("/me");
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401) {
    clearToken();
    throw new Error("Your session expired. Sign in again.");
  }
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || text || `Failed (${res.status})`);
  return json as { wallet: string; email: string; emailEnabled: boolean; minSeverity: string };
}

export async function updateNotificationPrefs(prefs: { emailEnabled?: boolean; minSeverity?: string }): Promise<{ wallet: string; email: string; emailEnabled: boolean; minSeverity: string }> {
  const res = await authFetch("/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401) {
    clearToken();
    throw new Error("Your session expired. Sign in again.");
  }
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || text || `Failed (${res.status})`);
  return json as { wallet: string; email: string; emailEnabled: boolean; minSeverity: string };
}

export async function unlinkAccount(): Promise<void> {
  const res = await authFetch("/me", { method: "DELETE" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401) {
    clearToken();
    throw new Error("Your session expired. Sign in again.");
  }
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || text || `Failed (${res.status})`);
  clearToken();
}

export async function sendTestEmail(): Promise<void> {
  const res = await authFetch("/notifications/test", { method: "POST" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401) {
    clearToken();
    throw new Error("Your session expired. Sign in again.");
  }
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error || text || `Failed (${res.status})`);
}
