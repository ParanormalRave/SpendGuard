// Countdown text for the withdrawal card.
//
// Uses the same wording and algorithm as backend/src/scripts/printPolicy.ts, so
// the CLI and the dashboard describe the same wait the same way.

/**
 * How long until `unlockAt` (unix seconds), as a short duration: "45s",
 * "29m 12s", "5h 12m 3s", "2d 3h". Returns "ready now" once the time has
 * passed.
 *
 * `nowSeconds` is injectable so callers can tick a stable value and so tests
 * do not depend on the wall clock. The program compares against its own Clock;
 * this is a hint, not the authority.
 */
export function formatCountdown(
  unlockAt: bigint | number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  // Unix seconds fit comfortably in a double, so this is exact for any real
  // timestamp the program can store.
  const remaining = Number(unlockAt) - nowSeconds;
  if (!Number.isFinite(remaining) || remaining <= 0) return "ready now";
  return formatDuration(remaining);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 || rest > 0) parts.push(`${rest}s`);
  return parts.join(" ");
}
