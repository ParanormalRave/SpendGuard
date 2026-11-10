import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { loadConfig } from "../config";
import { fetchPolicy } from "../chain/policy";
import { initDb } from "../db";
import { buildSystemPrompt } from "./prompt";
import { buildScenarioTask } from "./scenarios";
import { runToolLoop, type ToolLoopClient } from "./loop";
import {
  TOOL_DEFS,
  toolGetBalance,
  toolGetPolicy,
  toolListServices,
  toolPay,
  type AgentAttempt,
  type ToolCallResult,
} from "./tools";

export { buildSystemPrompt } from "./prompt";
export { findService, loadServices, type Service } from "./services";
export {
  API_SCENARIOS,
  buildScenarioTask,
  computeScenarioAmounts,
  DEFAULT_CUSTOM_TASK,
  FIXED_SCENARIOS,
  getScenarioTask,
  type ApiScenario,
  type Scenario,
} from "./scenarios";
export { TOOL_DEFS, toolGetBalance, toolGetPolicy, toolListServices, toolPay, type AgentAttempt, type ToolDefinition, type ToolCallResult } from "./tools";

const MAX_ROUNDS = 10;

export type AgentStopReason = "end_turn" | "max_rounds" | "no_output" | "error";

export interface AgentRunResult {
  message: string;
  attempts: AgentAttempt[];
  rounds: number;
  stoppedReason: AgentStopReason;
}

/** The local tool definitions in the OpenAI function-calling shape. */
const OPENAI_TOOLS: ChatCompletionTool[] = TOOL_DEFS.map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

/** Tool results are JSON strings; the loop serialises the handler's return value. */
function toolValue(result: ToolCallResult): unknown {
  return JSON.parse(result.content) as unknown;
}

/**
 * Runs the agent for one scenario.
 *
 * The model decides what to buy; every `pay` call is forwarded to `toolPay`
 * unchanged, so the on-chain program is what accepts or rejects it. Attempts
 * are collected from the tool results for the HTTP response.
 */
export async function runAgent(scenario: string, task?: string): Promise<AgentRunResult> {
  const config = loadConfig();

  if (!config.llmApiKey) {
    throw new Error("LLM_API_KEY is required to run the agent");
  }
  if (!config.llmModel) {
    throw new Error("LLM_MODEL is required to run the agent");
  }
  if (!config.llmBaseUrl) {
    throw new Error("LLM_BASE_URL is required to run the agent");
  }

  // Ensure the SQLite file exists before any logAttempt.
  initDb();

  // Build the system prompt and scenario task from the live policy when possible.
  // The policy is fetched once and reused — no second fetch.
  let systemPrompt: string;
  let fetchedPolicy: Awaited<ReturnType<typeof fetchPolicy>> | null = null;
  if (config.policyAddress) {
    try {
      fetchedPolicy = await fetchPolicy(config.policyAddress);
      systemPrompt = buildSystemPrompt(fetchedPolicy);
    } catch {
      // Policy fetch can fail (devnet lag, wrong address). Still let the model
      // try; the tool handlers will surface the real error.
      systemPrompt = buildSystemPrompt(null);
    }
  } else {
    systemPrompt = buildSystemPrompt(null);
  }

  let taskText: string;
  if (scenario === "custom") {
    taskText = buildScenarioTask(scenario, fetchedPolicy, task);
  } else {
    // Fixed scenarios require a policy to compute amounts; validate early before spending API tokens.
    if (fetchedPolicy === null) {
      throw new Error("POLICY_ADDRESS is required to run this scenario");
    }
    taskText = buildScenarioTask(scenario, fetchedPolicy, task);
  }

  const attempts: AgentAttempt[] = [];

  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {
    get_policy: async () => toolValue(await toolGetPolicy()),
    get_balance: async () => toolValue(await toolGetBalance()),
    list_services: async () => toolValue(await toolListServices()),
    pay: async (args: unknown) => {
      const input = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
      const serviceId =
        typeof input.service_id === "string" ? input.service_id : String(input.service_id ?? "");
      const amountLamports = Number(input.amount_lamports);
      const reason = typeof input.reason === "string" ? input.reason : String(input.reason ?? "");

      // No filtering: the model's request goes to executePayment unchanged.
      const result = await toolPay(serviceId, amountLamports, reason, scenario);
      if (result.attempt !== undefined) attempts.push(result.attempt);
      return toolValue(result);
    },
  };

  const client = new OpenAI({ baseURL: config.llmBaseUrl, apiKey: config.llmApiKey });

  let result: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    result = await runToolLoop({
      // runToolLoop is SDK-free, so its client type is the plain shape it uses.
      client: client as unknown as ToolLoopClient,
      model: config.llmModel,
      systemPrompt,
      userPrompt: taskText,
      tools: OPENAI_TOOLS,
      handlers,
      maxRounds: MAX_ROUNDS,
      onLog: process.env.AGENT_DEBUG === "1" ? console.log : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM API error: ${message}`);
  }

  const stoppedReason: AgentStopReason = result.stoppedEarly
    ? "max_rounds"
    : result.text.length > 0
      ? "end_turn"
      : "no_output";

  const message =
    result.text.length > 0
      ? result.text
      : stoppedReason === "max_rounds"
        ? "Reached 10 tool rounds without a final answer. Check the attempt log for what was submitted."
        : "The model returned no text and no tool calls.";

  return { message, attempts, rounds: result.rounds, stoppedReason };
}
