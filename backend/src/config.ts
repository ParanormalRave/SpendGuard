import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";

// Read backend/.env (paths are relative to the process working directory, so
// run the backend from the backend/ folder). Real deployments use real env vars.
dotenv.config({ quiet: true });

export interface AppConfig {
  /** Solana RPC endpoint. Devnet or localnet only. */
  rpcUrl: string;
  /** Deployed SpendGuard program. Must match the IDL in src/idl. */
  programId: PublicKey;
  /** Keypair the agent pays with (the agent_transfer signer). */
  agentKeypairPath: string;
  /** Keypair the keeper pays transaction fees with (M5). */
  keeperKeypairPath?: string;
  /** Policy the demo agent and UI operate on (4F). */
  policyAddress?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  googleClientId?: string;
  jwtSecret?: string;
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  emailFrom?: string;
  unusualMultiplier: number;
  unusualMinHistory: number;
  nearLimitPercent: number;
  port: number;
  frontendOrigin: string;
}

interface NumberBounds {
  min?: number;
  max?: number;
}

/**
 * Reads and validates the environment.
 *
 * Required for every step from 4A onwards: RPC_URL, PROGRAM_ID,
 * AGENT_KEYPAIR_PATH. Everything else is optional until the milestone that
 * first uses it (the LLM via Groq in 4E, SMTP/Google in M7), so the
 * foundation can be verified without billable keys.
 *
 * Collects every problem before throwing, so a bad .env needs one fix pass.
 * Not cached: calling it again re-reads the environment.
 */
export function loadConfig(): AppConfig {
  const errors: string[] = [];

  const rpcUrl = requiredEnv("RPC_URL", errors);
  const programIdRaw = requiredEnv("PROGRAM_ID", errors); 
  
  const agentKeypairPath = requiredEnv("AGENT_KEYPAIR_PATH", errors);

  if (rpcUrl !== undefined) {
    validateRpcUrl(rpcUrl, errors);
  }

  let programId: PublicKey | undefined;
  if (programIdRaw !== undefined) {
    try {
      programId = new PublicKey(programIdRaw);
    } catch {
      errors.push(
        `PROGRAM_ID is not a valid Solana public key: "${programIdRaw}"`,
      );
    }
  }

  const smtpPort = integerEnv("SMTP_PORT", 587, errors, { min: 1, max: 65535 });
  const unusualMultiplier = numberEnv("UNUSUAL_MULTIPLIER", 3, errors, {
    min: 0,
  });
  const unusualMinHistory = integerEnv("UNUSUAL_MIN_HISTORY", 3, errors, {
    min: 0,
  });
  const nearLimitPercent = integerEnv("NEAR_LIMIT_PERCENT", 80, errors, {
    min: 1,
    max: 100,
  });
  const port = integerEnv("PORT", 3001, errors, { min: 1, max: 65535 });

  // One throw for everything, including the (impossible) case of a required
  // value missing without a recorded error.
  if (
    errors.length > 0 ||
    rpcUrl === undefined ||
    programId === undefined ||
    agentKeypairPath === undefined
  ) {
    const details =
      errors.length > 0 ? errors : ["unknown configuration error"];
    throw new Error(
      `Invalid configuration:\n${details.map((message) => ` - ${message}`).join("\n")}`,
    );
  }

  return {
    rpcUrl,
    programId,
    agentKeypairPath,
    keeperKeypairPath: optionalEnv("KEEPER_KEYPAIR_PATH"),
    policyAddress: optionalEnv("POLICY_ADDRESS"),
    llmBaseUrl: optionalEnv("LLM_BASE_URL"),
    llmApiKey: optionalEnv("LLM_API_KEY"),
    llmModel: optionalEnv("LLM_MODEL"),
    googleClientId: optionalEnv("GOOGLE_CLIENT_ID"),
    jwtSecret: optionalEnv("JWT_SECRET"),
    smtpHost: optionalEnv("SMTP_HOST"),
    smtpPort,
    smtpUser: optionalEnv("SMTP_USER"),
    smtpPass: optionalEnv("SMTP_PASS")?.replace(/\s+/g, ""),
    emailFrom: optionalEnv("EMAIL_FROM"),
    unusualMultiplier,
    unusualMinHistory,
    nearLimitPercent,
    port,
    frontendOrigin: optionalEnv("FRONTEND_ORIGIN") ?? "http://localhost:3000",
  };
}

/** Returns the trimmed value, treating an empty string as "not set". */
function readEnv(key: string): string | undefined {
  let value = process.env[key]?.trim().replace(/\r/g, "");
  if (value !== undefined && value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim().replace(/\r/g, "");
    }
  }
  return value === undefined || value.length === 0 ? undefined : value;
}

function optionalEnv(key: string): string | undefined {
  return readEnv(key);
}

function requiredEnv(key: string, errors: string[]): string | undefined {
  const value = readEnv(key);
  if (value === undefined) {
    errors.push(`${key} is required`);
  }
  return value;
}

function numberEnv(
  key: string,
  fallback: number,
  errors: string[],
  bounds: NumberBounds,
): number {
  const raw = readEnv(key);
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    errors.push(`${key} must be a number, got "${raw}"`);
    return fallback;
  }
  if (bounds.min !== undefined && value < bounds.min) {
    errors.push(`${key} must be at least ${bounds.min}, got ${value}`);
    return fallback;
  }
  if (bounds.max !== undefined && value > bounds.max) {
    errors.push(`${key} must be at most ${bounds.max}, got ${value}`);
    return fallback;
  }
  return value;
}

function integerEnv(
  key: string,
  fallback: number,
  errors: string[],
  bounds: NumberBounds,
): number {
  const value = numberEnv(key, fallback, errors, bounds);
  if (!Number.isInteger(value)) {
    errors.push(`${key} must be a whole number, got ${value}`);
    return fallback;
  }
  return value;
}

function validateRpcUrl(raw: string, errors: string[]): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    errors.push(`RPC_URL is not a valid URL: "${raw}"`);
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    errors.push("RPC_URL must start with http:// or https://");
  }

  // Hard rule: this project never touches mainnet.
  if (/mainnet/i.test(url.hostname)) {
    errors.push(
      "RPC_URL points at mainnet. SpendGuard is devnet/localnet only.",
    );
  }
}
