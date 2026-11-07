use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, events::RecipientAdded, state::Policy};

#[derive(Accounts)]
pub struct AddRecipient<'info> {
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

pub fn handle_add_recipient(ctx: Context<AddRecipient>, recipient: Pubkey) -> Result<()> {
    require!(recipient != Pubkey::default(), ErrorCode::InvalidRecipient);

    let policy = &mut ctx.accounts.policy;
    let count = policy.allowed_count as usize;
    require!(count < MAX_RECIPIENTS, ErrorCode::RecipientListFull);
    require!(
        !policy.allowed_recipients[..count].contains(&recipient),
        ErrorCode::DuplicateRecipient
    );

    policy.allowed_recipients[count] = recipient;
    policy.allowed_count = (count + 1) as u8;

    emit!(RecipientAdded {
        policy: policy.key(),
        recipient,
    });

    Ok(())
}
