use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, events::WithdrawRequested, state::Policy};

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
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

pub fn handle_request_withdraw(ctx: Context<RequestWithdraw>, amount: u64) -> Result<()> {
    let policy = &mut ctx.accounts.policy;

    require!(
        policy.pending_amount == 0,
        ErrorCode::WithdrawalAlreadyPending
    );
    require!(amount > 0, ErrorCode::InvalidAmount);

    let vault_balance = ctx.accounts.vault.lamports();
    require!(amount <= vault_balance, ErrorCode::InsufficientVaultFunds);

    let remaining = vault_balance - amount;
    let rent_exempt_minimum = Rent::get()?.minimum_balance(0);
    require!(
        remaining == 0 || remaining >= rent_exempt_minimum,
        ErrorCode::InsufficientVaultFunds
    );

    let now = Clock::get()?.unix_timestamp;
    policy.pending_amount = amount;
    policy.pending_unlock_at = now + policy.withdraw_delay_seconds;

    emit!(WithdrawRequested {
        policy: policy.key(),
        amount,
        unlock_at: policy.pending_unlock_at,
    });

    Ok(())
}
