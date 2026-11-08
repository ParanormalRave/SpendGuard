# SpendGuard tests

These tests are the **spec**. A strong model wrote them. Your cheaper model's job is to write code that makes them pass.

## How to use them

1. Copy the files into your repo, keeping the same paths (`backend/src/...` and `frontend/src/...`).
2. Install what the tests need.
   - Backend: `yarn add -D tsx @types/node @types/better-sqlite3` and `yarn add better-sqlite3 tweetnacl bs58`
   - Frontend: `yarn add -D tsx @types/node`
3. Add this script to `backend/package.json` and `frontend/package.json`:
   `"test": "tsx --test $(find src -name '*.test.ts')"`
4. Run `yarn test`. Everything fails at first, because the implementation files do not exist yet. That is correct.
5. Give the agent one test file at a time with this prompt:

```
Context: read docs/CONTRACT-STATE.md.
Task: create <implementation file> so that <test file> passes. The required exports are listed in the comment at the top of the test file.
Rules: do NOT edit the test file. If a test looks wrong, tell me instead of changing it. Money maths uses BigInt only, never floating point. Do not add features the tests do not need.
Run yarn test and stop when every test in that file passes. Show me the output.
```

## Order of importance

| # | Test file | Implementation file | Why it matters |
|---|---|---|---|
| 1 | `backend/src/payments/errors.test.ts` | `backend/src/payments/errors.ts` | Wrong classification hides rejected payments, which is your whole demo |
| 2 | `backend/src/lib/money.test.ts` and `frontend/src/lib/money.test.ts` | `src/lib/money.ts` (identical copy in both) | A conversion mistake changes how much money moves |
| 3 | `backend/src/anomaly/detectAnomalies.test.ts` | `backend/src/anomaly/detectAnomalies.ts` | Decides which alerts fire |
| 4 | `backend/src/db/alerts.test.ts` | `backend/src/db/index.ts` | Duplicate or missing alerts, and the NULL signature problem |
| 5 | `backend/src/auth/wallet.test.ts` | `backend/src/auth/wallet.ts` | Security: proves who owns a wallet |
| 6 | `backend/src/auth/nonce.test.ts` | `backend/src/auth/nonce.ts` | Security: stops replayed login messages |
| 7 | `backend/src/notify/severity.test.ts` | `backend/src/notify/severity.ts` | Decides who gets emailed |
| 8 | `frontend/src/lib/errors.test.ts` | `frontend/src/lib/errors.ts` | Fails if the contract gets a new error with no message |
| 9 | `frontend/src/lib/countdown.test.ts` | `frontend/src/lib/countdown.ts` | Withdrawal countdown text |

Do the first six before the demo. Items 7 to 9 are quick.

## Decisions built into these tests

- Money is `bigint` in lamports. SOL strings are strict decimals with at most 9 digits after the point.
- Alerts de-duplicate on a required, non-empty `dedupeKey`. The transaction signature is informational and may be null.
- Severity order is info, then warning, then critical.
- Wallet signatures are base58 strings of a detached ed25519 signature over the UTF-8 message.
- Nonces last 5 minutes and work once.
- Near-limit and unusual-amount checks use exact integer maths, with whole-number settings.
- `explainError` reads the IDL, so it needs `src/idl/spendguard.json` (run `./scripts/sync-idl.sh`) and must be run from the frontend folder.

Update AGENTS.md to match these decisions when you edit it.

## Check that a test can actually fail

After a test passes, break the code on purpose and run the tests again. For example, change `>` to `>=` in `detectAnomalies`, or remove the `dedupeKey` check. The matching test must fail. If it still passes, the test is not protecting you. Undo the change with `git restore <file>`.

## What these do not cover

- The 20 contract tests you already have cover the on-chain rules.
- `executePayment`, the watcher and the keeper talk to the real chain, so check them with scripts against devnet (for example `testPayments.ts`), not unit tests.