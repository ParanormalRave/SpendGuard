use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the policy agent can make payments")]
    Unauthorized,
    #[msg("The policy is paused")]
    Paused,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Amount exceeds the per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Amount exceeds the window limit")]
    ExceedsWindowLimit,
    #[msg("Recipient is not on the allowlist")]
    RecipientNotAllowed,
    #[msg("Vault does not have enough funds")]
    InsufficientVaultFunds,
    #[msg("Funds are reserved for a pending withdrawal")]
    FundsReserved,
    #[msg("Invalid policy configuration")]
    InvalidPolicyConfig,
    #[msg("Recipient list is full")]
    RecipientListFull,
    #[msg("Recipient is already on the allowlist")]
    DuplicateRecipient,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("A withdrawal is already pending")]
    WithdrawalAlreadyPending,
    #[msg("No withdrawal is pending")]
    NoPendingWithdrawal,
    #[msg("Withdrawal is not ready to be released")]
    WithdrawalNotReady,
    #[msg("Vault is not empty")]
    VaultNotEmpty,
}
