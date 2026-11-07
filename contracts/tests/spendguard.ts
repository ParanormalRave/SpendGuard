import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Spendguard } from "../target/types/spendguard";

describe("spendguard", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.spendguard as Program<Spendguard>;

  it("Initializes and increments a counter", async () => {
    const [counter] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      program.programId
    );

    const initializeTx = await program.methods
      .initialize()
      .accountsPartial({ counter })
      .rpc();
    console.log("Initialize transaction signature", initializeTx);

    const incrementTx = await program.methods
      .increment()
      .accountsPartial({ counter })
      .rpc();
    console.log("Increment transaction signature", incrementTx);
  });
});
