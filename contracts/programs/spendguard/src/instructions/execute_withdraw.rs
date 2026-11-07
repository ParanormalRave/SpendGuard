use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::{constants::*, error::ErrorCode, events::WithdrawExecuted, state::Policy};

#[derive(Accounts)]
pub struct ExecuteWithdraw<'info> {
    /// CHECK: destination; must equal policy.owner, enforced by has_one below
    #[account(mut)]
    pub owner: SystemAccount<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [POLICY_SEED, policy.owner.as_ref(), &policy.policy_id.to_le_bytes()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        mut,
        seeds = [VAULT_SEED, policy.key().as_ref()],
        bump = policy.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_execute_withdraw(ctx: Context<ExecuteWithdraw>) -> Result<()> {
    let policy = &mut ctx.accounts.policy;

    require!(policy.pending_amount > 0, ErrorCode::NoPendingWithdrawal);

    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= policy.pending_unlock_at,
        ErrorCode::WithdrawalNotReady
    );

    let amount = policy.pending_amount;
    let policy_key = policy.key();
    let owner_key = policy.owner;
    let vault_bump = policy.vault_bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, policy_key.as_ref(), &[vault_bump]];

    system_program::transfer(
        CpiContext::new_with_signer(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    policy.pending_amount = 0;
    policy.pending_unlock_at = 0;

    emit!(WithdrawExecuted {
        policy: policy_key,
        owner: owner_key,
        amount,
    });

    Ok(())
}
