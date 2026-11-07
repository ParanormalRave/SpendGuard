use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::{constants::*, error::ErrorCode, state::Policy};

#[derive(Accounts)]
pub struct Deposit<'info> {
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
        mut,
        seeds = [VAULT_SEED, policy.key().as_ref()],
        bump = policy.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}
