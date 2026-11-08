import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectAnomalies,
  type AnomalyPayment,
  type AnomalyPolicyState,
  type AnomalyThresholds,
} from "../src/anomaly";
import type { RecipientStats } from "../src/db";

/**
 * Pure tests: explicit thresholds mean no `.env`, no database and no RPC.
 */

const THRESHOLDS: AnomalyThresholds = {
  unusualMultiplier: 3,
  unusualMinHistory: 3,
  nearLimitPercent: 80,
};

const POLICY = "policy-1";
const OWNER = "owner-1";
const RECIPIENT = "recipient-1";
const TX = "tx-1";

function stats(count: number, totalAmount: number): RecipientStats {
  return {
    count,
    totalAmount,
    averageAmount: count === 0 ? 0 : Math.floor(totalAmount / count),
  };
}

function payment(overrides: Partial<AnomalyPayment> = {}): AnomalyPayment {
  return {
    policy: POLICY,
    recipient: RECIPIENT,
    amountLamports: 100,
    txSignature: TX,
    recipientStats: stats(0, 0),
    ...overrides,
  };
}

function state(overrides: Partial<AnomalyPolicyState> = {}): AnomalyPolicyState {
  return {
    owner: OWNER,
    spentInWindow: 0,
    windowLimit: 100_000_000,
    ...overrides,
  };
}

function typesOf(alerts: ReturnType<typeof detectAnomalies>): string[] {
  return alerts.map((alert) => alert.type);
}

describe("detectAnomalies: new recipient", () => {
  it("flags the first payment to a recipient", () => {
    const alerts = detectAnomalies(
      payment({ amountLamports: 5_000 }),
      state(),
      THRESHOLDS,
    );

    assert.deepEqual(typesOf(alerts), ["NEW_RECIPIENT_PAYMENT"]);
    assert.equal(alerts[0]!.severity, "warning");
    const data = alerts[0]!.data as { recipient: string; amountLamports: number };
    assert.equal(data.recipient, RECIPIENT);
    assert.equal(data.amountLamports, 5_000);
  });

  it("does not flag a recipient with earlier payments", () => {
    const alerts = detectAnomalies(
      payment({ amountLamports: 100, recipientStats: stats(3, 300) }),
      state(),
      THRESHOLDS,
    );
    assert.deepEqual(alerts, []);
  });
});

describe("detectAnomalies: unusual amount", () => {
  it("does not alert below UNUSUAL_MIN_HISTORY even for a huge payment", () => {
    const alerts = detectAnomalies(
      payment({ amountLamports: 1_000, recipientStats: stats(2, 200) }),
      state(),
      THRESHOLDS,
    );
    assert.deepEqual(typesOf(alerts), []);
  });

  it("does not alert at exactly UNUSUAL_MULTIPLIER x average", () => {
    // 3 earlier payments totalling 300 -> average 100; 3 x 100 = 300.
    const alerts = detectAnomalies(
      payment({ amountLamports: 300, recipientStats: stats(3, 300) }),
      state(),
      THRESHOLDS,
    );
    assert.deepEqual(typesOf(alerts), []);
  });

  it("alerts just above UNUSUAL_MULTIPLIER x average", () => {
    const alerts = detectAnomalies(
      payment({ amountLamports: 301, recipientStats: stats(3, 300) }),
      state(),
      THRESHOLDS,
    );

    assert.deepEqual(typesOf(alerts), ["UNUSUAL_AMOUNT"]);
    const data = alerts[0]!.data as {
      recipient: string;
      amountLamports: number;
      averageAmount: number;
      previousPayments: number;
    };
    assert.equal(data.recipient, RECIPIENT);
    assert.equal(data.amountLamports, 301);
    assert.equal(data.averageAmount, 100);
    assert.equal(data.previousPayments, 3);
  });

  it("uses the exact total rather than the floored average", () => {
    // 3 payments of 100/100/101: true average 100.33, floored 100.
    // 3 x true average is 301, so 301 is NOT unusual, 302 is.
    assert.deepEqual(
      typesOf(
        detectAnomalies(
          payment({ amountLamports: 301, recipientStats: stats(3, 301) }),
          state(),
          THRESHOLDS,
        ),
      ),
      [],
    );
    assert.deepEqual(
      typesOf(
        detectAnomalies(
          payment({ amountLamports: 302, recipientStats: stats(3, 301) }),
          state(),
          THRESHOLDS,
        ),
      ),
      ["UNUSUAL_AMOUNT"],
    );
  });

  it("honours custom thresholds", () => {
    const statsWithFour = stats(4, 400); // average 100
    const custom: AnomalyThresholds = {
      unusualMultiplier: 5,
      unusualMinHistory: 3,
      nearLimitPercent: 80,
    };
    // 400 is > 3 x 100 but not > 5 x 100.
    assert.deepEqual(
      typesOf(detectAnomalies(payment({ amountLamports: 400, recipientStats: statsWithFour }), state(), THRESHOLDS)),
      ["UNUSUAL_AMOUNT"],
    );
    assert.deepEqual(
      typesOf(detectAnomalies(payment({ amountLamports: 400, recipientStats: statsWithFour }), state(), custom)),
      [],
    );

    // minHistory 5 suppresses the alert even when the amount is huge.
    const highHistory: AnomalyThresholds = { ...THRESHOLDS, unusualMinHistory: 5 };
    assert.deepEqual(
      typesOf(
        detectAnomalies(
          payment({ amountLamports: 10_000, recipientStats: statsWithFour }),
          state(),
          highHistory,
        ),
      ),
      [],
    );
  });
});

describe("detectAnomalies: near window limit", () => {
  const history = stats(3, 300);

  it("stays quiet just below the threshold", () => {
    const alerts = detectAnomalies(
      payment({ recipientStats: history }),
      state({ spentInWindow: 79_999_999, windowLimit: 100_000_000 }),
      THRESHOLDS,
    );
    assert.deepEqual(typesOf(alerts), []);
  });

  it("alerts at exactly the threshold", () => {
    const alerts = detectAnomalies(
      payment({ recipientStats: history }),
      state({ spentInWindow: 80_000_000, windowLimit: 100_000_000 }),
      THRESHOLDS,
    );
    assert.deepEqual(typesOf(alerts), ["NEAR_WINDOW_LIMIT"]);
    const data = alerts[0]!.data as {
      spentInWindow: number;
      windowLimit: number;
      nearLimitPercent: number;
    };
    assert.equal(data.spentInWindow, 80_000_000);
    assert.equal(data.windowLimit, 100_000_000);
    assert.equal(data.nearLimitPercent, 80);
  });

  it("alerts when the window is fully spent", () => {
    const alerts = detectAnomalies(
      payment({ recipientStats: history }),
      state({ spentInWindow: 100_000_000, windowLimit: 100_000_000 }),
      THRESHOLDS,
    );
    assert.deepEqual(typesOf(alerts), ["NEAR_WINDOW_LIMIT"]);
  });

  it("uses integer cross-multiplication, not rounded percentages", () => {
    // 33% of 10 is 3.3, so 3/10 must NOT alert and 4/10 must.
    const percent33: AnomalyThresholds = { ...THRESHOLDS, nearLimitPercent: 33 };
    assert.deepEqual(
      typesOf(
        detectAnomalies(
          payment({ recipientStats: history }),
          state({ spentInWindow: 3, windowLimit: 10 }),
          percent33,
        ),
      ),
      [],
    );
    assert.deepEqual(
      typesOf(
        detectAnomalies(
          payment({ recipientStats: history }),
          state({ spentInWindow: 4, windowLimit: 10 }),
          percent33,
        ),
      ),
      ["NEAR_WINDOW_LIMIT"],
    );
  });
});

describe("detectAnomalies: shape", () => {
  it("returns ready-to-raise AlertInputs with policy, owner and signature", () => {
    const alerts = detectAnomalies(
      payment({ amountLamports: 500, recipientStats: stats(0, 0) }),
      state({ spentInWindow: 90_000_000, windowLimit: 100_000_000 }),
      THRESHOLDS,
    );

    assert.deepEqual(typesOf(alerts), ["NEW_RECIPIENT_PAYMENT", "NEAR_WINDOW_LIMIT"]);
    for (const alert of alerts) {
      assert.equal(alert.policy, POLICY);
      assert.equal(alert.owner, OWNER);
      assert.equal(alert.txSignature, TX);
      assert.equal(alert.severity, "warning");
      assert.ok(alert.title.length > 0);
      assert.ok(alert.message.length > 0);
    }
  });
});
