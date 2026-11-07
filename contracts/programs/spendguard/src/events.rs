use anchor_lang::prelude::*;

#[event]
pub struct PolicyInitialized {
    pub policy: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct PaymentExecuted {
    pub policy: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub spent_in_window: u64,
    pub window_limit: u64,
    pub timestamp: i64,
}

#[event]
pub struct RecipientAdded {
    pub policy: Pubkey,
    pub recipient: Pubkey,
}

#[event]
pub struct PausedChanged {
    pub policy: Pubkey,
    pub paused: bool,
}

#[event]
pub struct WithdrawRequested {
    pub policy: Pubkey,
    pub amount: u64,
    pub unlock_at: i64,
}

#[event]
pub struct WithdrawCancelled {
    pub policy: Pubkey,
}

#[event]
pub struct WithdrawExecuted {
    pub policy: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}
