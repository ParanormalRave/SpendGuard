// Plain-English copy for the program's own errors.
//
// Every code in AGENTS.md section 5 has one sentence here, written for someone
// who has never used Solana. The activity feed shows the sentence instead of the
// raw code, so a blocked payment reads as an explanation rather than a wall of
// jargon. Codes match the IDL (6000 to 6015).
//
// Wording rules (docs/design.md section 10): sentence case, say what happened
// and what to do next, no apologies, no jargon.

const FALLBACK = "The program rejected this action. Check the policy and try again.";

const EXPLANATIONS: Record<string, string> = {
  Unauthorized: "This action can only be done by the wallet that owns the policy.",
  Paused: "The policy is paused, so no payments can go through. Resume it to let the agent pay again.",
  InvalidAmount: "The amount was zero or invalid. Enter an amount greater than zero.",
  ExceedsPerTxLimit: "This payment is larger than the per-payment limit set in the policy.",
  ExceedsWindowLimit: "This payment would go over the spending limit for the current window.",
  RecipientNotAllowed: "The agent tried to pay an address that is not on your list.",
  InsufficientVaultFunds:
    "The vault does not hold enough SOL for this payment. Deposit more and try again.",
  FundsReserved:
    "Part of the vault is reserved for a pending withdrawal, so this payment cannot go through.",
  InvalidPolicyConfig: "These policy settings are not valid. Check the limits and the withdrawal delay.",
  RecipientListFull: "The recipient list is full. A policy can hold up to 10 recipients.",
  DuplicateRecipient: "That address is already on the recipient list.",
  InvalidRecipient: "That address cannot be used as a recipient.",
  WithdrawalAlreadyPending:
    "A withdrawal is already waiting to be released. Cancel it or wait for it to unlock.",
  NoPendingWithdrawal: "There is no withdrawal waiting to be released.",
  WithdrawalNotReady: "The withdrawal is still in its waiting period. Try again when the countdown ends.",
  VaultNotEmpty: "The vault still holds SOL. Withdraw everything before closing the policy.",
};

/**
 * Turns a program error code into one plain sentence.
 *
 * Unknown codes, and a missing code (a pre-send failure logs none), get a
 * generic sentence so the UI never shows a raw code to the owner.
 */
export function explainError(code: string | null | undefined): string {
  if (!code) return FALLBACK;
  return EXPLANATIONS[code] ?? FALLBACK;
}
