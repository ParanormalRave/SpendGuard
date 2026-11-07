pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("AzvuWQBBrawzLRFYkH7DiCY4c9326cnncJWGkySnEsEZ");

#[program]
pub mod spendguard {
    use super::*;

    pub fn initialize_policy(
        ctx: Context<InitializePolicy>,
        policy_id: u64,
        per_tx_limit: u64,
        window_limit: u64,
        window_seconds: i64,
        withdraw_delay_seconds: i64,
        allowed_recipients: Vec<Pubkey>,
    ) -> Result<()> {
        crate::instructions::initialize_policy::handle_initialize_policy(
            ctx,
            policy_id,
            per_tx_limit,
            window_limit,
            window_seconds,
            withdraw_delay_seconds,
            allowed_recipients,
        )
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        crate::instructions::deposit::handle_deposit(ctx, amount)
    }

    pub fn agent_transfer(ctx: Context<AgentTransfer>, amount: u64) -> Result<()> {
        crate::instructions::agent_transfer::handle_agent_transfer(ctx, amount)
    }

    pub fn add_recipient(ctx: Context<AddRecipient>, recipient: Pubkey) -> Result<()> {
        crate::instructions::add_recipient::handle_add_recipient(ctx, recipient)
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        crate::instructions::set_paused::handle_set_paused(ctx, paused)
    }

    pub fn request_withdraw(ctx: Context<RequestWithdraw>, amount: u64) -> Result<()> {
        crate::instructions::request_withdraw::handle_request_withdraw(ctx, amount)
    }

    pub fn cancel_withdraw(ctx: Context<CancelWithdraw>) -> Result<()> {
        crate::instructions::cancel_withdraw::handle_cancel_withdraw(ctx)
    }

    pub fn execute_withdraw(ctx: Context<ExecuteWithdraw>) -> Result<()> {
        crate::instructions::execute_withdraw::handle_execute_withdraw(ctx)
    }

    pub fn close_policy(ctx: Context<ClosePolicy>) -> Result<()> {
        crate::instructions::close_policy::handle_close_policy(ctx)
    }
}
