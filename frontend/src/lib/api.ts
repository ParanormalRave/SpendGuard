import { BACKEND_URL } from "./env";

export interface PaymentDto {
  signature: string;
  policy: string;
  recipient: string;
  amountLamports: number;
  timestamp: number;
}

export interface AttemptDto {
  id: number;
  timestamp: number;
  scenario: string;
  policy: string;
  recipient: string;
  service_id: string | null;
  amount_lamports: number;
  reason: string | null;
  status: string;
  error_code: string | null;
  signature: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchPayments(policyAddress: string, limit = 100): Promise<PaymentDto[]> {
  const addr = encodeURIComponent(policyAddress);
  return getJson<PaymentDto[]>(`/policy/${addr}/payments?limit=${limit}`);
}

export function fetchAttempts(limit = 100): Promise<AttemptDto[]> {
  return getJson<AttemptDto[]>(`/agent/attempts?limit=${limit}`);
}

export interface AlertDto {
  policy: string;
  owner: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  txSignature: string | null;
  dedupeKey: string;
  createdAt: string;
}

export function fetchAlerts(
  params: { policy?: string; owner?: string; limit?: number } = {},
): Promise<{ alerts: AlertDto[] }> {
  const qs = new URLSearchParams();
  if (params.policy) qs.set("policy", params.policy);
  if (params.owner) qs.set("owner", params.owner);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<{ alerts: AlertDto[] }>(`/alerts${suffix}`);
}

// Legacy helper — callers that only had a policy string
export function fetchAlertsByPolicy(policyAddress: string, limit = 100): Promise<AlertDto[]> {
  return fetchAlerts({ policy: policyAddress, limit }).then((r) => r.alerts);
}

export interface ConfigPublicDto {
  agentPublicKey: string;
  policyAddress: string | null;
}

export function fetchConfigPublic(): Promise<ConfigPublicDto> {
  return getJson<ConfigPublicDto>(`/config/public`);
}

export interface RunAgentResult {
  scenario: string;
  task: string;
  message: string;
  attempts: AttemptDto[];
  reason?: string;
}

export async function runScenario(
  scenario: string,
  opts?: { task?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<RunAgentResult> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, string> = { scenario };
    if (opts?.task) body.task = opts.task;
    const res = await fetch(`${BACKEND_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      // keep raw text for error
    }
    if (!res.ok) {
      const msg =
        (json as { error?: string } | null)?.error ||
        text ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return json as RunAgentResult;
  } finally {
    clearTimeout(timer);
    if (opts?.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}
