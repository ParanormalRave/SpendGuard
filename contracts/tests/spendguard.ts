import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Spendguard } from "../target/types/spendguard";
import { assert } from "chai";

const SOL = anchor.web3.LAMPORTS_PER_SOL;

describe("spendguard", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.spendguard as Program<Spendguard>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const owner = provider.wallet;

  const agent = anchor.web3.Keypair.generate();
  const rogue = anchor.web3.Keypair.generate();
  const recipient1 = anchor.web3.Keypair.generate();
  const recipient2 = anchor.web3.Keypair.generate();

  let policySeq = 0;

  function nextPolicyId(): anchor.BN {
    policySeq += 1;
    return new anchor.BN(Date.now()).add(new anchor.BN(policySeq));
  }

  function derivePolicy(ownerKey: anchor.web3.PublicKey, policyId: anchor.BN) {
    const [policy] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("policy"),
        ownerKey.toBuffer(),
        policyId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), policy.toBuffer()],
      program.programId
    );
    return { policy, vault };
  }

  async function createPolicy(opts: {
    perTxLimit: number;
    windowLimit: number;
    windowSeconds: number;
    withdrawDelaySeconds: number;
    recipients: anchor.web3.PublicKey[];
    agentKey?: anchor.web3.Keypair;
    depositLamports?: number;
  }) {
    const policyId = nextPolicyId();
    const agentKey = opts.agentKey ?? agent;
    const { policy, vault } = derivePolicy(owner.publicKey, policyId);

    await program.methods
      .initializePolicy(
        policyId,
        new anchor.BN(opts.perTxLimit),
        new anchor.BN(opts.windowLimit),
        new anchor.BN(opts.windowSeconds),
        new anchor.BN(opts.withdrawDelaySeconds),
        opts.recipients
      )
      .accountsPartial({
        owner: owner.publicKey,
        agent: agentKey.publicKey,
        policy,
        vault,
      })
      .rpc();

    if (opts.depositLamports) {
      await program.methods
        .deposit(new anchor.BN(opts.depositLamports))
        .accountsPartial({ owner: owner.publicKey, policy, vault })
        .rpc();
    }

    return { policy, vault, agentKey, policyId };
  }

  async function expectError(promise: Promise<unknown>, code: string) {
    let err: unknown;
    try {
      await promise;
    } catch (e) {
      err = e;
    }
    assert.ok(err, `expected ${code} but the transaction succeeded`);
    assert.instanceOf(err, anchor.AnchorError);
    assert.equal((err as anchor.AnchorError).error.errorCode.code, code);
  }

  before(async () => {
    for (const keypair of [agent, rogue]) {
      const signature = await provider.connection.requestAirdrop(
        keypair.publicKey,
        2 * SOL
      );
      await provider.connection.confirmTransaction(signature);
    }
  });

  // ---------------------------------------------------------------- M1

  it("M1: legit transfer succeeds", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    const before = await provider.connection.getBalance(recipient1.publicKey);

    await program.methods
      .agentTransfer(new anchor.BN(SOL / 2))
      .accountsPartial({
        policy,
        vault,
        recipient: recipient1.publicKey,
        agent: agent.publicKey,
      })
      .signers([agent])
      .rpc();

    const after = await provider.connection.getBalance(recipient1.publicKey);
    assert.equal(after - before, SOL / 2);

    const stored = await program.account.policy.fetch(policy);
    assert.equal(stored.spentInWindow.toNumber(), SOL / 2);
  });

  it("M1: amount over the per-tx limit fails with ExceedsPerTxLimit", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(2 * SOL))
        .accountsPartial({
          policy,
          vault,
          recipient: recipient1.publicKey,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc(),
      "ExceedsPerTxLimit"
    );
  });

  it("M1: recipient not on the allowlist fails with RecipientNotAllowed", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(SOL / 10))
        .accountsPartial({
          policy,
          vault,
          recipient: rogue.publicKey,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc(),
      "RecipientNotAllowed"
    );
  });

  it("M1: transfer signed by a wrong key fails", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(SOL / 10))
        .accountsPartial({
          policy,
          vault,
          recipient: recipient1.publicKey,
          agent: rogue.publicKey,
        })
        .signers([rogue])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  // ---------------------------------------------------------------- M2

  it("M2: window limit exceeded fails", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 1.5 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .agentTransfer(new anchor.BN(SOL))
      .accountsPartial({
        policy,
        vault,
        recipient: recipient1.publicKey,
        agent: agent.publicKey,
      })
      .signers([agent])
      .rpc();

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(SOL))
        .accountsPartial({
          policy,
          vault,
          recipient: recipient1.publicKey,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc(),
      "ExceedsWindowLimit"
    );
  });

  it("M2: window resets after window_seconds", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 1.5 * SOL,
      windowSeconds: 3,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .agentTransfer(new anchor.BN(SOL))
      .accountsPartial({
        policy,
        vault,
        recipient: recipient1.publicKey,
        agent: agent.publicKey,
      })
      .signers([agent])
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 4000));

    await program.methods
      .agentTransfer(new anchor.BN(SOL))
      .accountsPartial({
        policy,
        vault,
        recipient: recipient1.publicKey,
        agent: agent.publicKey,
      })
      .signers([agent])
      .rpc();

    const stored = await program.account.policy.fetch(policy);
    assert.equal(stored.spentInWindow.toNumber(), SOL);
  });

  it("M2: paused blocks the agent", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .setPaused(true)
      .accountsPartial({ owner: owner.publicKey, policy })
      .rpc();

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(SOL / 10))
        .accountsPartial({
          policy,
          vault,
          recipient: recipient1.publicKey,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc(),
      "Paused"
    );

    await program.methods
      .setPaused(false)
      .accountsPartial({ owner: owner.publicKey, policy })
      .rpc();

    await program.methods
      .agentTransfer(new anchor.BN(SOL / 10))
      .accountsPartial({
        policy,
        vault,
        recipient: recipient1.publicKey,
        agent: agent.publicKey,
      })
      .signers([agent])
      .rpc();
  });

  it("M2: non-owner cannot add recipients, pause, request or cancel", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await expectError(
      program.methods
        .addRecipient(recipient2.publicKey)
        .accountsPartial({ owner: rogue.publicKey, policy })
        .signers([rogue])
        .rpc(),
      "ConstraintHasOne"
    );

    await expectError(
      program.methods
        .setPaused(true)
        .accountsPartial({ owner: rogue.publicKey, policy })
        .signers([rogue])
        .rpc(),
      "ConstraintHasOne"
    );

    await expectError(
      program.methods
        .requestWithdraw(new anchor.BN(SOL))
        .accountsPartial({ owner: rogue.publicKey, policy, vault })
        .signers([rogue])
        .rpc(),
      "ConstraintHasOne"
    );

    await expectError(
      program.methods
        .cancelWithdraw()
        .accountsPartial({ owner: rogue.publicKey, policy })
        .signers([rogue])
        .rpc(),
      "ConstraintHasOne"
    );
  });

  it("M2: withdrawal cannot execute before the unlock time", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 30,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .requestWithdraw(new anchor.BN(SOL))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await expectError(
      program.methods
        .executeWithdraw()
        .accountsPartial({
          policy,
          vault,
          owner: owner.publicKey,
          caller: owner.publicKey,
        })
        .rpc(),
      "WithdrawalNotReady"
    );
  });

  it("M2: withdrawal executes after the delay and pays the owner", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 2,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .requestWithdraw(new anchor.BN(SOL))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const before = await provider.connection.getBalance(owner.publicKey);

    await program.methods
      .executeWithdraw()
      .accountsPartial({
        policy,
        vault,
        owner: owner.publicKey,
        caller: owner.publicKey,
      })
      .rpc();

    const after = await provider.connection.getBalance(owner.publicKey);
    assert.isAbove(after - before, SOL - 100_000);

    const stored = await program.account.policy.fetch(policy);
    assert.equal(stored.pendingAmount.toNumber(), 0);
    assert.equal(stored.pendingUnlockAt.toNumber(), 0);
  });

  it("M2: cancel clears the pending request", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .requestWithdraw(new anchor.BN(SOL))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await program.methods
      .cancelWithdraw()
      .accountsPartial({ owner: owner.publicKey, policy })
      .rpc();

    const stored = await program.account.policy.fetch(policy);
    assert.equal(stored.pendingAmount.toNumber(), 0);
    assert.equal(stored.pendingUnlockAt.toNumber(), 0);
  });

  it("M2: agent cannot spend funds reserved for a pending withdrawal", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 2 * SOL,
    });

    await program.methods
      .requestWithdraw(new anchor.BN(1.5 * SOL))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await expectError(
      program.methods
        .agentTransfer(new anchor.BN(SOL))
        .accountsPartial({
          policy,
          vault,
          recipient: recipient1.publicKey,
          agent: agent.publicKey,
        })
        .signers([agent])
        .rpc(),
      "FundsReserved"
    );
  });

  it("M2: second request_withdraw while one is pending fails", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: 5 * SOL,
    });

    await program.methods
      .requestWithdraw(new anchor.BN(SOL))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await expectError(
      program.methods
        .requestWithdraw(new anchor.BN(SOL))
        .accountsPartial({ owner: owner.publicKey, policy, vault })
        .rpc(),
      "WithdrawalAlreadyPending"
    );
  });

  it("M2: add_recipient rejects duplicates, the zero address, and a full list", async () => {
    const { policy } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: SOL,
    });

    await expectError(
      program.methods
        .addRecipient(recipient1.publicKey)
        .accountsPartial({ owner: owner.publicKey, policy })
        .rpc(),
      "DuplicateRecipient"
    );

    await expectError(
      program.methods
        .addRecipient(anchor.web3.PublicKey.default)
        .accountsPartial({ owner: owner.publicKey, policy })
        .rpc(),
      "InvalidRecipient"
    );

    for (let i = 0; i < 9; i++) {
      const keypair = anchor.web3.Keypair.generate();
      await program.methods
        .addRecipient(keypair.publicKey)
        .accountsPartial({ owner: owner.publicKey, policy })
        .rpc();
    }

    await expectError(
      program.methods
        .addRecipient(anchor.web3.Keypair.generate().publicKey)
        .accountsPartial({ owner: owner.publicKey, policy })
        .rpc(),
      "RecipientListFull"
    );
  });

  it("M2: close_policy fails with a non-empty vault or a pending withdrawal", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 2,
      recipients: [recipient1.publicKey],
      depositLamports: SOL,
    });

    await expectError(
      program.methods
        .closePolicy()
        .accountsPartial({ owner: owner.publicKey, policy, vault })
        .rpc(),
      "VaultNotEmpty"
    );

    const balance = await provider.connection.getBalance(vault);
    await program.methods
      .requestWithdraw(new anchor.BN(balance))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await expectError(
      program.methods
        .closePolicy()
        .accountsPartial({ owner: owner.publicKey, policy, vault })
        .rpc(),
      "NoPendingWithdrawal"
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await program.methods
      .executeWithdraw()
      .accountsPartial({
        policy,
        vault,
        owner: owner.publicKey,
        caller: owner.publicKey,
      })
      .rpc();

    await program.methods
      .closePolicy()
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    const info = await provider.connection.getAccountInfo(policy);
    assert.isNull(info);
  });

  it("M2: vault rent floor is respected", async () => {
    const { policy, vault } = await createPolicy({
      perTxLimit: SOL,
      windowLimit: 10 * SOL,
      windowSeconds: 3600,
      withdrawDelaySeconds: 60,
      recipients: [recipient1.publicKey],
      depositLamports: SOL,
    });

    const balance = await provider.connection.getBalance(vault);

    // Draining to exactly 0 is allowed.
    await program.methods
      .requestWithdraw(new anchor.BN(balance))
      .accountsPartial({ owner: owner.publicKey, policy, vault })
      .rpc();

    await program.methods
      .cancelWithdraw()
      .accountsPartial({ owner: owner.publicKey, policy })
      .rpc();

    // Leaving a dust amount below the rent floor is rejected.
    await expectError(
      program.methods
        .requestWithdraw(new anchor.BN(balance - 1))
        .accountsPartial({ owner: owner.publicKey, policy, vault })
        .rpc(),
      "InsufficientVaultFunds"
    );
  });
});
