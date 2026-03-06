/**
 * Parse agent response to sampling prompt into outcome bucket.
 * Extracted for testability (BUG-01.1).
 */

const FAILURE_SIGNALS = [
  "yes",
  "blocked",
  "denied",
  "failed",
  "403",
  "error",
  "rejected",
  "banned",
  "forbidden",
  "captcha",
  "stopped",
];

export function parseResponse(
  text: string
): "accepted" | "denied" | "inconclusive" {
  if (!text || text.trim().length === 0) return "inconclusive";

  const lower = text.toLowerCase().trim();

  // "no, I was not denied" = accepted (check before denial signals)
  if (lower.includes("not denied") || lower.includes("wasn't denied"))
    return "accepted";

  // "yesterday" contains "yes" — exclude false positives
  if (lower === "yesterday") return "inconclusive";

  // Denial signals — "no, I was blocked" must be denied
  if (FAILURE_SIGNALS.some((s) => lower.includes(s))) return "denied";

  // "no" alone or "no" variants = accepted
  if (lower === "no" || lower === "no." || lower === "no,") return "accepted";
  if (lower.startsWith("no")) return "accepted";

  return "inconclusive";
}
