const KEY = "spendguard:activePolicy";

export function readStoredPolicyAddress(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredPolicyAddress(address: string): void {
  try {
    localStorage.setItem(KEY, address);
  } catch {
    // ignore quota/private-mode errors
  }
}

export function clearStoredPolicyAddress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
