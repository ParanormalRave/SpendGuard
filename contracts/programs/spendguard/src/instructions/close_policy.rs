use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::Policy};

#[derive(Accounts)]
pub struct ClosePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        close = owner,
        seeds = [POLICY_SEED, policy.owner.as_ref(), &policy.policy_id.to_le_bytes()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        seeds = [VAULT_SEED, policy.key().as_ref()],
        bump = policy.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
}

pub fn handle_close_policy(ctx: Context<ClosePolicy>) -> Result<()> {
    let policy = &ctx.accounts.policy;

    require!(policy.pending_amount == 0, ErrorCode::NoPendingWithdrawal);
    require!(ctx.accounts.vault.lamports() == 0, ErrorCode::VaultNotEmpty);

    Ok(())
}
