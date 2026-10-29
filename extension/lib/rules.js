// Client-side RuleSet (F-02). Mirrors backend RuleSet.score so the pre-filter decision
// made in the browser matches the one the backend would make.

const WORD = String.raw`[\p{L}\p{N}_]`;
const UNICODE_BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;

/** Backend patterns are Python regexes where \b is Unicode-aware. JS \b is ASCII-only even
 *  with the /u flag, so "lô đề" would never match. Rewrite \b as Unicode lookarounds. */
export function toJsRegex(pattern) {
  return new RegExp(pattern.replace(/(?<!\\)\\b/g, UNICODE_BOUNDARY), "iu");
}

export class RuleSet {
  constructor(rules = [], version = "unknown") {
    this.version = version;
    this.rules = [];
    for (const r of rules) {
      if (r.enabled === false) continue;
      try {
        this.rules.push({ ...r, regex: toJsRegex(r.pattern) });
      } catch (e) {
        console.warn("[Browsie] skipping invalid rule", r.id, e.message);
      }
    }
  }

  matching(text) {
    if (!text) return [];
    return this.rules.filter((r) => r.regex.test(text));
  }

  /** 1 - Π(1 - w): bounded, monotonic, a single weight-1.0 hit gives 1.0. */
  score(text) {
    let remaining = 1;
    for (const r of this.matching(text)) remaining *= 1 - r.weight;
    return 1 - remaining;
  }

  /** BR-05: a gambling rule with weight 1.0 matched. */
  hasHardGamblingHit(text) {
    return this.matching(text).some((r) => r.category === "GAMBLING" && r.weight >= 1);
  }

  dominantCategory(text) {
    const totals = {};
    for (const r of this.matching(text)) totals[r.category] = (totals[r.category] || 0) + r.weight;
    const entries = Object.entries(totals);
    return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;
  }
}
