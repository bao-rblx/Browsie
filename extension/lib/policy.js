// Pure policy helpers shared by background, popup and options. No chrome.* calls here,
// so everything is unit-testable with `node --test`.

/** BR-02 rule thresholds and BR-04 LLM-confidence thresholds (same values as the backend). */
export const PROFILES = {
  LOW: { ruleThreshold: 0.7, llmThreshold: 0.8 },
  MEDIUM: { ruleThreshold: 0.5, llmThreshold: 0.6 },
  HIGH: { ruleThreshold: 0.3, llmThreshold: 0.4 },
};

export const POSITIVE_LABELS = new Set(["SPAM", "FAKE_NEWS", "GAMBLING_AD"]);

export const LABEL_TEXT = {
  SPAM: "Spam",
  FAKE_NEWS: "Possible fake news",
  GAMBLING_AD: "Gambling ad",
  UNKNOWN: "Could not verify",
  BENIGN: "No issues",
};

const DOMAIN_RE = /^(?=.{1,253}$)(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidDomain(domain) {
  return typeof domain === "string" && DOMAIN_RE.test(domain.trim().toLowerCase());
}

/** Accepts "example.com", "https://www.example.com/path" or "*.example.com"; returns a domain or null. */
export function normalizeDomain(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    try { s = new URL(s).hostname; } catch { return null; }
  }
  s = s.replace(/\/.*$/, "").replace(/:\d+$/, "");
  return isValidDomain(s) ? s : null;
}

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

/** BR-03: exact host or any subdomain of an allowlisted domain. */
export function isAllowlisted(host, allowlist = []) {
  if (!host) return false;
  host = host.toLowerCase();
  return allowlist.some((entry) => {
    const d = (entry.domain || entry).replace(/^\*\./, "");
    return host === d || host.endsWith("." + d);
  });
}

/** BR-02 / BR-05: should this text chunk be sent to the backend? */
export function textDecision(ruleset, text, sensitivity = "MEDIUM") {
  const profile = PROFILES[sensitivity] || PROFILES.MEDIUM;
  const score = ruleset.score(text);
  const hard = ruleset.hasHardGamblingHit(text);
  return { score, hard, send: hard || score >= profile.ruleThreshold };
}

/** BR-08: never a false BENIGN when the service fails. */
export function unavailableVerdict(reason = "Service unavailable — tap to retry") {
  return { label: "UNKNOWN", confidence: 0, rationale: reason, modelVersion: "fallback", llmCalled: false };
}

/** BR-05 fallback when the backend is down but a hard gambling rule matched locally. */
export function localGamblingVerdict(rationale = "Gambling keywords detected in page text") {
  return { label: "GAMBLING_AD", confidence: 1, rationale, modelVersion: "rules-local" };
}

export function isPositive(verdict) {
  return !!verdict && POSITIVE_LABELS.has(verdict.label);
}
