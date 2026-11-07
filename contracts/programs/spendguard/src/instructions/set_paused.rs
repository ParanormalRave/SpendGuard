use anchor_lang::prelude::*;

use crate::{constants::*, events::PausedChanged, state::Policy};

#[derive(Accounts)]
pub struct SetPaused<'info> {
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

pub fn handle_set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let policy = &mut ctx.accounts.policy;
    policy.paused = paused;

    emit!(PausedChanged {
        policy: policy.key(),
        paused,
    });

    Ok(())
}
