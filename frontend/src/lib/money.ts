// Money helpers. Lamports are integers; SOL exists only as a display string.
//
// The backend and frontend must keep an identical copy of this file
// (backend/src/lib/money.ts). Change both together.
//
// No floating point maths anywhere: parsing and formatting are done with
// strings and BigInt so a value can never drift by a lamport.

const LAMPORTS_PER_SOL = 1_000_000_000n;
const U64_MAX = 18_446_744_073_709_551_615n;

/** Strict decimal: digits, optionally a point and 1 to 9 decimals. */
const SOL_DECIMAL = /^\d+(\.\d{1,9})?$/;

/**
 * Converts a SOL amount written as a decimal string ("0.1", "1", "0.000000001")
 * into lamports.
 *
 * Rejects everything else: empty strings, whitespace, signs, exponents, commas,
 * more than 9 decimals, and values above the u64 range.
 */
export function solToLamports(sol: string): bigint {
  if (typeof sol !== "string" || !SOL_DECIMAL.test(sol)) {
    throw new Error(
      `Invalid SOL amount ${JSON.stringify(sol)}: use digits only, with at most 9 decimals.`,
    );
  }

  const [whole, fraction = ""] = sol.split(".");
  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fraction.padEnd(9, "0"));

  if (lamports > U64_MAX) {
    throw new Error(`Invalid SOL amount ${sol}: it is larger than the maximum a u64 can hold.`);
  }

  return lamports;
}

/**
 * Formats lamports as a SOL decimal string with no trailing zeros ("0.1", "1",
 * "0.000000001"). Throws on negative values.
 */
export function lamportsToSol(lamports: bigint): string {
  if (typeof lamports !== "bigint") {
    throw new Error("lamportsToSol expects a bigint.");
  }
  if (lamports < 0n) {
    throw new Error(`Invalid lamports ${lamports.toString()}: amounts cannot be negative.`);
  }

  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");

  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}
