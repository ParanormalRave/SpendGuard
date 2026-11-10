import { test } from "node:test";
import assert from "node:assert/strict";
import { API_SCENARIOS, buildScenarioTask, computeScenarioAmounts } from "./scenarios.js";

function fakePolicy(perTx: bigint, windowLimit: bigint): any {
  return {
    perTxLimit: { toString: () => perTx.toString() },
    windowLimit: { toString: () => windowLimit.toString() },
  };
}

test("computeScenarioAmounts pure math", () => {
  const perTx = 100_000_000n;
  const windowLimit = 250_000_000n;
  const a = computeScenarioAmounts(perTx, windowLimit);
  assert.equal(a.normal[0], 10_000_000n);
  assert.equal(a.normal[1], 10_000_000n);
  assert.equal(a.overspendFirst, 250_000_000n); // perTx*5/2
  assert.equal(a.overspendPerTx, 100_000_000n);
  assert.equal(a.overspendMaxRepeats, 4n); // 250/100 +2
  assert.equal(a.unusualSmall, 5_000_000n);
  assert.equal(a.unusualLarge, 50_000_000n);
  assert.equal(a.injection, 50_000_000n);
});

test("zero amounts throw", () => {
  assert.throws(() => computeScenarioAmounts(7n, 10n), /too small/);
  assert.throws(() => computeScenarioAmounts(0n, 100n), /too small/);
  assert.throws(() => buildScenarioTask("normal", fakePolicy(7n, 100n)), /too small/);
});

test("unusual is in API_SCENARIOS", () => {
  assert.ok((API_SCENARIOS as readonly string[]).includes("unusual"));
});

test("normal task contains exact amounts and service ids", () => {
  const perTx = 100_000_000n;
  const policy = fakePolicy(perTx, 300_000_000n);
  const task = buildScenarioTask("normal", policy);
  assert.match(task, /10000000 lamports to data-api/);
  assert.match(task, /10000000 lamports to market-news/);
});

test("overspend task contains perTx*5/2 and repeats", () => {
  const perTx = 100_000_000n;
  const windowLimit = 250_000_000n;
  const task = buildScenarioTask("overspend", fakePolicy(perTx, windowLimit));
  assert.match(task, /250000000 lamports to compute-market/);
  assert.match(task, /100000000 lamports to data-api/);
  assert.match(task, /at most 4 payments/);
});

test("unusual task contains perTx/20 three times and perTx/2", () => {
  const perTx = 100_000_000n;
  const task = buildScenarioTask("unusual", fakePolicy(perTx, 300_000_000n));
  assert.match(task, /5000000 lamports to market-news/);
  assert.match(task, /50000000 lamports to market-news/);
});

test("injection task mentions rogue-service and perTx/2", () => {
  const perTx = 100_000_000n;
  const task = buildScenarioTask("injection", fakePolicy(perTx, 300_000_000n));
  assert.match(task, /SYSTEM OVERRIDE/);
  assert.match(task, /50000000 lamports to rogue-service/);
  assert.match(task, /rogue-service/);
});
