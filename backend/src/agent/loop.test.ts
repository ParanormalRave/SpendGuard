/* eslint-disable @typescript-eslint/no-explicit-any -- loose fake client shapes in tests */
// Tests for src/agent/loop.ts (the provider-neutral tool loop, no SDK imports inside it)
// Required export:
//   runToolLoop(opts): Promise<{ text: string; rounds: number; stoppedEarly: boolean }>
//   opts = {
//     client: { chat: { completions: { create(params): Promise<{ choices: [{ message: any; finish_reason?: string }] }> } } },
//     model: string, systemPrompt: string, userPrompt: string,
//     tools: unknown[],                              // OpenAI function format, passed through untouched
//     handlers: Record<string, (args: any) => Promise<unknown>>,
//     maxRounds?: number,                            // default 10 model calls
//     sleep?: (ms: number) => Promise<void>,         // default real sleep; tests inject a fake
//   }
// Behaviour:
//   - messages start as [system, user]
//   - an assistant message with tool_calls is pushed, every call is run, and one
//     { role: 'tool', tool_call_id, content } message (content = JSON string) is pushed per call
//   - arguments arrive as a JSON STRING. Invalid JSON, an unknown tool, or a handler that throws
//     produce an error result { error: string } for the model. The loop never throws for these.
//   - an assistant message without tool_calls ends the loop; text is its content ('' if null)
//   - after maxRounds model calls it stops and returns stoppedEarly: true
//   - HTTP 429 from create(): wait, then retry, up to 3 retries. Wait = retry-after seconds * 1000
//     when present (headers may be a plain object or have .get), otherwise 1000 * attempt number.
//     If the 3rd retry still fails, throw an Error whose message contains 'busy'.
//   - any other error from create() is rethrown immediately, with no retry
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop } from './loop';

const tools = [
  { type: 'function', function: { name: 'echo', description: 'Echo text', parameters: { type: 'object', properties: {} } } },
];

const toolCall = (id: string, name: string, args: unknown) => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});

const reply = (message: Record<string, unknown>) => ({
  choices: [{ message: { role: 'assistant', content: null, ...message }, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
});

const rateLimit = (headers: unknown = {}) => Object.assign(new Error('rate limited'), { status: 429, headers });

const fakeClient = (responder: (callNumber: number) => unknown) => {
  const calls: any[] = [];
  const client = {
    chat: {
      completions: {
        create: async (params: any) => {
          calls.push(structuredClone(params));
          const next = responder(calls.length);
          if (next instanceof Error) throw next;
          return next as any;
        },
      },
    },
  };
  return { client, calls };
};

const base = (client: any, over: Record<string, unknown> = {}) => ({
  client,
  model: 'test-model',
  systemPrompt: 'You are an agent.',
  userPrompt: 'Do the task.',
  tools,
  handlers: {} as Record<string, (args: any) => Promise<unknown>>,
  sleep: async () => {},
  ...over,
});

test('returns the text when the model answers without using tools', async () => {
  const { client, calls } = fakeClient(() => reply({ content: 'done' }));
  const result = await runToolLoop(base(client));
  assert.deepEqual(result, { text: 'done', rounds: 1, stoppedEarly: false });
  assert.equal(calls[0].model, 'test-model');
  assert.deepEqual(calls[0].tools, tools);
  assert.equal(calls[0].messages[0].role, 'system');
  assert.equal(calls[0].messages[0].content, 'You are an agent.');
  assert.equal(calls[0].messages[1].role, 'user');
  assert.equal(calls[0].messages[1].content, 'Do the task.');
});

test('runs a tool call and sends the result back to the model', async () => {
  const seen: unknown[] = [];
  const { client, calls } = fakeClient((n) =>
    n === 1 ? reply({ tool_calls: [toolCall('c1', 'echo', { text: 'hi' })] }) : reply({ content: 'all done' }),
  );
  const handlers = {
    echo: async (args: any) => {
      seen.push(args);
      return { echoed: args.text };
    },
  };
  const result = await runToolLoop(base(client, { handlers }));
  assert.equal(result.text, 'all done');
  assert.equal(result.rounds, 2);
  assert.deepEqual(seen, [{ text: 'hi' }]);
  const messages = calls[1].messages;
  assert.deepEqual(messages[messages.length - 1], {
    role: 'tool',
    tool_call_id: 'c1',
    content: JSON.stringify({ echoed: 'hi' }),
  });
  assert.equal(messages[messages.length - 2].role, 'assistant');
  assert.equal(messages[messages.length - 2].tool_calls[0].id, 'c1');
});

test('answers every tool call from one assistant message, in order', async () => {
  const { client, calls } = fakeClient((n) =>
    n === 1
      ? reply({ tool_calls: [toolCall('c1', 'echo', { text: 'a' }), toolCall('c2', 'echo', { text: 'b' })] })
      : reply({ content: 'ok' }),
  );
  const handlers = { echo: async (args: any) => ({ echoed: args.text }) };
  await runToolLoop(base(client, { handlers }));
  const toolMessages = calls[1].messages.filter((m: any) => m.role === 'tool');
  assert.deepEqual(toolMessages.map((m: any) => m.tool_call_id), ['c1', 'c2']);
  assert.deepEqual(toolMessages.map((m: any) => JSON.parse(m.content).echoed), ['a', 'b']);
});

test('malformed JSON arguments become an error result and the handler is not called', async () => {
  let called = false;
  const { client, calls } = fakeClient((n) =>
    n === 1 ? reply({ tool_calls: [toolCall('c1', 'echo', '{not json')] }) : reply({ content: 'recovered' }),
  );
  const handlers = {
    echo: async () => {
      called = true;
      return {};
    },
  };
  const result = await runToolLoop(base(client, { handlers }));
  assert.equal(called, false);
  assert.equal(result.text, 'recovered');
  const toolMessage = calls[1].messages.find((m: any) => m.role === 'tool');
  assert.equal(typeof JSON.parse(toolMessage.content).error, 'string');
});

test('an unknown tool becomes an error result instead of throwing', async () => {
  const { client, calls } = fakeClient((n) =>
    n === 1 ? reply({ tool_calls: [toolCall('c1', 'does_not_exist', {})] }) : reply({ content: 'ok' }),
  );
  const result = await runToolLoop(base(client));
  assert.equal(result.text, 'ok');
  const toolMessage = calls[1].messages.find((m: any) => m.role === 'tool');
  assert.equal(typeof JSON.parse(toolMessage.content).error, 'string');
});

test('a handler that throws becomes an error result', async () => {
  const { client, calls } = fakeClient((n) =>
    n === 1 ? reply({ tool_calls: [toolCall('c1', 'echo', {})] }) : reply({ content: 'ok' }),
  );
  const handlers = {
    echo: async () => {
      throw new Error('boom');
    },
  };
  const result = await runToolLoop(base(client, { handlers }));
  assert.equal(result.text, 'ok');
  const toolMessage = calls[1].messages.find((m: any) => m.role === 'tool');
  assert.match(JSON.parse(toolMessage.content).error, /boom/);
});

test('stops after maxRounds model calls', async () => {
  const { client, calls } = fakeClient(() => reply({ tool_calls: [toolCall('c', 'echo', {})] }));
  const handlers = { echo: async () => ({}) };
  const result = await runToolLoop(base(client, { handlers, maxRounds: 3 }));
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.rounds, 3);
  assert.equal(calls.length, 3);
});

test('the default limit is 10 rounds', async () => {
  const { client, calls } = fakeClient(() => reply({ tool_calls: [toolCall('c', 'echo', {})] }));
  const handlers = { echo: async () => ({}) };
  const result = await runToolLoop(base(client, { handlers }));
  assert.equal(result.rounds, 10);
  assert.equal(calls.length, 10);
  assert.equal(result.stoppedEarly, true);
});

test('a 429 waits for retry-after seconds and then retries', async () => {
  const sleeps: number[] = [];
  const { client, calls } = fakeClient((n) => (n === 1 ? rateLimit({ 'retry-after': '2' }) : reply({ content: 'done' })));
  const result = await runToolLoop(base(client, { sleep: async (ms: number) => void sleeps.push(ms) }));
  assert.equal(result.text, 'done');
  assert.deepEqual(sleeps, [2000]);
  assert.equal(calls.length, 2);
});

test('retry-after is also read from a Headers object', async () => {
  const sleeps: number[] = [];
  const { client } = fakeClient((n) =>
    n === 1 ? rateLimit(new Headers({ 'retry-after': '3' })) : reply({ content: 'done' }),
  );
  await runToolLoop(base(client, { sleep: async (ms: number) => void sleeps.push(ms) }));
  assert.deepEqual(sleeps, [3000]);
});

test('without retry-after the wait grows with each attempt', async () => {
  const sleeps: number[] = [];
  const { client } = fakeClient((n) => (n <= 2 ? rateLimit() : reply({ content: 'done' })));
  await runToolLoop(base(client, { sleep: async (ms: number) => void sleeps.push(ms) }));
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('gives up with a busy error after 3 retries', async () => {
  const sleeps: number[] = [];
  const { client, calls } = fakeClient(() => rateLimit());
  await assert.rejects(runToolLoop(base(client, { sleep: async (ms: number) => void sleeps.push(ms) })), /busy/);
  assert.equal(calls.length, 4);
  assert.equal(sleeps.length, 3);
});

test('errors other than 429 are rethrown immediately', async () => {
  const sleeps: number[] = [];
  const { client, calls } = fakeClient(() => Object.assign(new Error('bad key'), { status: 401 }));
  await assert.rejects(runToolLoop(base(client, { sleep: async (ms: number) => void sleeps.push(ms) })), /bad key/);
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
});
