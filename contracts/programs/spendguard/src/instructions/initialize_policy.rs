use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, events::PolicyInitialized, state::Policy};

#[derive(Accounts)]
#[instruction(policy_id: u64)]
pub struct InitializePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The agent must be a system-owned wallet, not a program or PDA.
    pub agent: SystemAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Policy::INIT_SPACE,
        seeds = [POLICY_SEED, owner.key().as_ref(), &policy_id.to_le_bytes()],
        bump,
    )]
    pub policy: Account<'info, Policy>,

    /// CHECK: the vault is a system-owned PDA with no data. It is not created
    /// here; `deposit` creates and funds it. We only need its canonical bump.
    #[account(
        seeds = [VAULT_SEED, policy.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_policy(
    ctx: Context<InitializePolicy>,
    policy_id: u64,
    per_tx_limit: u64,
    window_limit: u64,
    window_seconds: i64,
    withdraw_delay_seconds: i64,
    allowed_recipients: Vec<Pubkey>,
) -> Result<()> {
    require!(
        allowed_recipients.len() <= MAX_RECIPIENTS,
        ErrorCode::RecipientListFull
    );
    require!(window_seconds > 0, ErrorCode::InvalidPolicyConfig);
    require!(per_tx_limit > 0, ErrorCode::InvalidPolicyConfig);
    require!(per_tx_limit <= window_limit, ErrorCode::InvalidPolicyConfig);
    require!(
        (1..=604800).contains(&withdraw_delay_seconds),
        ErrorCode::InvalidPolicyConfig
    );
    require!(
        ctx.accounts.agent.key() != ctx.accounts.owner.key(),
        ErrorCode::InvalidPolicyConfig
    );
    require!(
        ctx.accounts.agent.key() != Pubkey::default(),
        ErrorCode::InvalidPolicyConfig
    );

    let policy_key = ctx.accounts.policy.key();
    let vault_key = ctx.accounts.vault.key();
    let mut seen: Vec<Pubkey> = Vec::with_capacity(allowed_recipients.len());
    for recipient in allowed_recipients.iter() {
        require!(*recipient != Pubkey::default(), ErrorCode::InvalidRecipient);
        require!(*recipient != policy_key, ErrorCode::InvalidRecipient);
        require!(*recipient != vault_key, ErrorCode::InvalidRecipient);
        require!(!seen.contains(recipient), ErrorCode::DuplicateRecipient);
        seen.push(*recipient);
    }

    let policy = &mut ctx.accounts.policy;
    policy.owner = ctx.accounts.owner.key();
    policy.agent = ctx.accounts.agent.key();
    policy.policy_id = policy_id;
    policy.per_tx_limit = per_tx_limit;
    policy.window_limit = window_limit;
    policy.window_seconds = window_seconds;
    policy.window_start = Clock::get()?.unix_timestamp;
    policy.spent_in_window = 0;
    policy.withdraw_delay_seconds = withdraw_delay_seconds;
    policy.paused = false;
    policy.pending_amount = 0;
    policy.pending_unlock_at = 0;
    policy.allowed_recipients = [Pubkey::default(); MAX_RECIPIENTS];
    for (index, recipient) in allowed_recipients.iter().enumerate() {
        policy.allowed_recipients[index] = *recipient;
    }
    policy.allowed_count = allowed_recipients.len() as u8;
    policy.bump = ctx.bumps.policy;
    policy.vault_bump = ctx.bumps.vault;

    // The vault is NOT created here. `deposit` creates it with the first
    // transfer, which must be at least the rent-exempt minimum.

    emit!(PolicyInitialized {
        policy: policy.key(),
        owner: policy.owner,
        agent: policy.agent,
    });

    Ok(())
}
