use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::{constants::*, error::ErrorCode, events::PaymentExecuted, state::Policy};

#[derive(Accounts)]
pub struct AgentTransfer<'info> {
    #[account(
        mut,
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

    #[account(mut)]
    pub recipient: SystemAccount<'info>,

    pub agent: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_agent_transfer(ctx: Context<AgentTransfer>, amount: u64) -> Result<()> {
    let policy = &mut ctx.accounts.policy;

    // 1. Only the policy's agent may move funds. We check this explicitly
    //    (instead of `has_one = agent`) so the failure is our own
    //    `Unauthorized` error rather than Anchor's `ConstraintHasOne`.
    require_keys_eq!(
        ctx.accounts.agent.key(),
        policy.agent,
        ErrorCode::Unauthorized
    );

    // 2. Kill switch.
    require!(!policy.paused, ErrorCode::Paused);
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(amount <= policy.per_tx_limit, ErrorCode::ExceedsPerTxLimit);

    let recipient_key = ctx.accounts.recipient.key();
    let allowed_count = policy.allowed_count as usize;
    // Defensive bound: `allowed_count` is only ever written by init and
    // `add_recipient`, but never trust stored data to size a slice.
    require!(
        allowed_count <= MAX_RECIPIENTS,
        ErrorCode::InvalidPolicyConfig
    );
    let allowed = policy.allowed_recipients[..allowed_count].contains(&recipient_key);
    require!(allowed, ErrorCode::RecipientNotAllowed);

    let now = Clock::get()?.unix_timestamp;
    // `saturating_sub` keeps this checked: if the clock ever moved backwards
    // the elapsed time is treated as 0, so the window simply does not reset.
    if now.saturating_sub(policy.window_start) >= policy.window_seconds {
        policy.window_start = now;
        policy.spent_in_window = 0;
    }

    let new_spent = policy
        .spent_in_window
        .checked_add(amount)
        .ok_or(ErrorCode::ExceedsWindowLimit)?;
    require!(
        new_spent <= policy.window_limit,
        ErrorCode::ExceedsWindowLimit
    );

    let vault_balance = ctx.accounts.vault.lamports();
    let remaining = vault_balance
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientVaultFunds)?;
    require!(remaining >= policy.pending_amount, ErrorCode::FundsReserved);
    let rent_exempt_minimum = Rent::get()?.minimum_balance(0);
    require!(
        remaining == 0 || remaining >= rent_exempt_minimum,
        ErrorCode::InsufficientVaultFunds
    );
    // The funds that are NOT reserved for a pending withdrawal must also be
    // zero or rent-exempt. Otherwise a later `execute_withdraw` would pay out
    // `pending_amount` and leave a dust balance that blocks `close_policy`.
    let unreserved = remaining
        .checked_sub(policy.pending_amount)
        .ok_or(ErrorCode::FundsReserved)?;
    require!(
        unreserved == 0 || unreserved >= rent_exempt_minimum,
        ErrorCode::InsufficientVaultFunds
    );

    let policy_key = policy.key();
    let vault_bump = policy.vault_bump;
    let signer_seeds: &[&[u8]] = &[VAULT_SEED, policy_key.as_ref(), &[vault_bump]];

    system_program::transfer(
        CpiContext::new_with_signer(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    policy.spent_in_window = new_spent;

    emit!(PaymentExecuted {
        policy: policy_key,
        recipient: recipient_key,
        amount,
        spent_in_window: new_spent,
        window_limit: policy.window_limit,
        timestamp: now,
    });

    Ok(())
}
