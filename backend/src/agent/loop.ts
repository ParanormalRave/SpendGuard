// Provider-neutral tool-calling loop.
//
// Deliberately imports no SDK: the caller passes an OpenAI-compatible client
// (the `openai` package pointed at Groq, or a fake in tests) and this file only
// uses the shape it needs. That keeps the loop testable without network access
// and keeps provider wiring out of the control flow.

/** One entry in the chat history. Kept loose because it is passed back as-is. */
interface ToolLoopMessage {
  role?: string;
  content?: unknown;
  tool_calls?: ToolLoopToolCall[];
  tool_call_id?: string;
}

interface ToolLoopToolCall {
  id: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

interface ToolLoopResponse {
  choices: Array<{
    message: ToolLoopMessage;
    finish_reason?: string;
  }>;
}

export interface ToolLoopClient {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<ToolLoopResponse>;
    };
  };
}

export type ToolHandler = (args: unknown) => Promise<unknown>;

export interface ToolLoopOptions {
  client: ToolLoopClient;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** OpenAI function definitions, forwarded untouched. */
  tools: unknown[];
  handlers: Record<string, ToolHandler>;
  /** Maximum number of model calls, not tool executions. Defaults to 10. */
  maxRounds?: number;
  /** Injected in tests so retry waits do not take real time. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional debug sink, called once per model reply and once per tool call. */
  onLog?: (line: string) => void;
}

export interface ToolLoopResult {
  text: string;
  rounds: number;
  stoppedEarly: boolean;
}

const DEFAULT_MAX_ROUNDS = 10;
const MAX_RETRIES = 3;

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const LOG_PREVIEW_LENGTH = 200;

/** Short, single-line rendering of any value for debug output. */
function preview(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    // Circular structures must never break the loop.
    text = String(value);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > LOG_PREVIEW_LENGTH ? `${text.slice(0, LOG_PREVIEW_LENGTH)}…` : text;
}

/** Debug logging must never change agent behaviour. */
function emit(onLog: ((line: string) => void) | undefined, line: string): void {
  if (onLog === undefined) return;
  try {
    onLog(line);
  } catch {
    // A broken sink is not a reason to fail a payment.
  }
}

/**
 * Runs the model until it answers without asking for a tool, or until
 * `maxRounds` model calls have been made.
 *
 * Tool arguments arrive as a JSON string. Invalid JSON, an unknown tool name,
 * or a handler that throws all become `{ error }` tool results for the model;
 * none of them throw out of this function.
 */
export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    client,
    model,
    systemPrompt,
    userPrompt,
    tools,
    handlers,
    maxRounds = DEFAULT_MAX_ROUNDS,
    sleep = realSleep,
    onLog,
  } = opts;

  const messages: ToolLoopMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let lastText = "";

  for (let round = 1; round <= maxRounds; round++) {
    const response = await createWithRetry(client, { model, messages, tools }, sleep);
    const message = response.choices[0]?.message;
    emit(
      onLog,
      `[agent] round ${round}/${maxRounds} reply finish=${response.choices[0]?.finish_reason ?? "?"} ` +
        `tool_calls=${message?.tool_calls?.length ?? 0} text="${preview(message?.content ?? "")}"`,
    );
    if (message === undefined) {
      return { text: lastText, rounds: round, stoppedEarly: false };
    }

    if (typeof message.content === "string" && message.content.length > 0) {
      lastText = message.content;
    }

    // Push the assistant message exactly as returned so tool_call ids match.
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = typeof message.content === "string" ? message.content : "";
      return { text, rounds: round, stoppedEarly: false };
    }

    for (const call of toolCalls) {
      const result = await runToolCall(call, handlers);
      emit(
        onLog,
        `[agent] round ${round} tool=${call.function?.name ?? "unknown"} ` +
          `args=${preview(call.function?.arguments)} result=${preview(result)}`,
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    if (round === maxRounds) {
      return { text: lastText, rounds: round, stoppedEarly: true };
    }
  }

  return { text: lastText, rounds: maxRounds, stoppedEarly: true };
}

/** Executes one tool call and always resolves to a value for the model. */
async function runToolCall(
  call: ToolLoopToolCall,
  handlers: Record<string, ToolHandler>,
): Promise<unknown> {
  const name = call.function?.name;
  const rawArguments = call.function?.arguments;

  let args: unknown = {};
  try {
    if (typeof rawArguments === "string") {
      args = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
    } else if (rawArguments !== undefined && rawArguments !== null) {
      args = rawArguments;
    }
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return { error: `Invalid JSON arguments for tool "${name ?? "unknown"}": ${detail}` };
  }

  const handler = name === undefined ? undefined : handlers[name];
  if (handler === undefined) {
    return { error: `Unknown tool "${name ?? "unknown"}"` };
  }

  try {
    const result = await handler(args);
    return result ?? null;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Calls the model, retrying HTTP 429 up to `MAX_RETRIES` times.
 *
 * The wait is `retry-after` seconds when the provider sends it (headers may be
 * a plain object or a `Headers` instance), otherwise 1s, 2s, 3s. Any other
 * error is rethrown immediately.
 */
async function createWithRetry(
  client: ToolLoopClient,
  params: Record<string, unknown>,
  sleep: (ms: number) => Promise<void>,
): Promise<ToolLoopResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err: unknown) {
      if (!isRateLimit(err)) throw err;

      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `The model provider is busy (HTTP 429) after ${MAX_RETRIES} retries.`,
        );
      }

      const waitMs = retryAfterMs(err) ?? 1000 * (attempt + 1);
      await sleep(waitMs);
    }
  }
}

function isRateLimit(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { status?: unknown }).status === 429
  );
}

/** `retry-after` in milliseconds, or null when absent or unparseable. */
function retryAfterMs(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const headers = (err as { headers?: unknown }).headers;
  if (typeof headers !== "object" || headers === null) return null;

  let raw: unknown;
  if (typeof (headers as { get?: unknown }).get === "function") {
    raw = (headers as { get(name: string): unknown }).get("retry-after");
  } else {
    const record = headers as Record<string, unknown>;
    raw = record["retry-after"] ?? record["Retry-After"];
  }

  if (raw === undefined || raw === null || raw === "") return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}
