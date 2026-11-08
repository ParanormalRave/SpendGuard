// Checks that your LLM provider (for example Groq) answers and supports tool calling.
// Run from the backend folder:  yarn tsx src/scripts/testLlm.ts
// Needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in backend/.env. It never prints the key.
import 'dotenv/config';
import OpenAI from 'openai';

const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_time',
      description: 'Returns the current time. Call it whenever the user asks for the time.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

async function attempt(client: OpenAI, model: string, toolChoice: 'auto' | 'required') {
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: 'What time is it? Use the tool.' }],
    tools,
    tool_choice: toolChoice,
    temperature: 0,
    max_tokens: 200,
  });
  const message = res.choices[0].message;
  const call = message.tool_calls?.[0];
  if (call && call.type === 'function') {
    return { ok: true as const, name: call.function.name, args: call.function.arguments };
  }
  return { ok: false as const, text: message.content ?? '' };
}

async function main() {
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    console.error('FAIL: set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in backend/.env');
    process.exit(1);
  }
  const client = new OpenAI({ baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY });
  console.log(`Model: ${LLM_MODEL}`);
  try {
    const auto = await attempt(client, LLM_MODEL, 'auto');
    if (auto.ok) {
      console.log(`PASS: the model asked to call ${auto.name} with arguments ${auto.args}`);
      return;
    }
    console.log(`The model answered in text instead of calling the tool: ${auto.text}`);
    const required = await attempt(client, LLM_MODEL, 'required');
    if (required.ok) {
      console.log('PARTIAL: it only calls tools when forced (tool_choice required). Make the system prompt stricter, or use a larger model.');
      return;
    }
    console.log('FAIL: no tool call even when forced. This model does not handle tool calling well. Try another model.');
    process.exit(1);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error(`FAIL: ${e.status ?? ''} ${e.message ?? String(err)}`);
    if (e.status === 401) console.error('The API key was rejected.');
    if (e.status === 400 || e.status === 404) console.error('Check LLM_MODEL against the provider model list.');
    if (e.status === 429) console.error('Rate limited. Wait a minute and try again.');
    process.exit(1);
  }
}

main();
