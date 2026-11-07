use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, events::WithdrawCancelled, state::Policy};

#[derive(Accounts)]
pub struct CancelWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [POLICY_SEED, policy.owner.as_ref(), &policy.policy_id.to_le_bytes()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,
}

pub fn handle_cancel_withdraw(ctx: Context<CancelWithdraw>) -> Result<()> {
    let policy = &mut ctx.accounts.policy;
    require!(policy.pending_amount > 0, ErrorCode::NoPendingWithdrawal);

    policy.pending_amount = 0;
    policy.pending_unlock_at = 0;

    emit!(WithdrawCancelled {
        policy: policy.key(),
    });

    Ok(())
}
