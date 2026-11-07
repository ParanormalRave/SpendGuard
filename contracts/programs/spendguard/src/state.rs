use anchor_lang::prelude::*;

use crate::constants::MAX_RECIPIENTS;

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub policy_id: u64,
    pub per_tx_limit: u64,
    pub window_limit: u64,
    pub window_seconds: i64,
    pub window_start: i64,
    pub spent_in_window: u64,
    pub withdraw_delay_seconds: i64,
    pub paused: bool,
    pub pending_amount: u64,
    pub pending_unlock_at: i64,
    pub allowed_recipients: [Pubkey; MAX_RECIPIENTS],
    pub allowed_count: u8,
    pub bump: u8,
    pub vault_bump: u8,
}
