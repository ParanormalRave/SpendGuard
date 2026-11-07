use anchor_lang::prelude::*;

#[constant]
pub const POLICY_SEED: &[u8] = b"policy";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

pub const MAX_RECIPIENTS: usize = 10;
