// Unit tests for the client-side pre-filter (F-02) and policy (BR-02, BR-03, BR-05, BR-08).
// Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_RULES } from "../lib/default-rules.js";
import {
  PROFILES, isAllowlisted, isPositive, normalizeDomain, textDecision, unavailableVerdict,
} from "../lib/policy.js";
import { RuleSet, toJsRegex } from "../lib/rules.js";

const rs = new RuleSet(DEFAULT_RULES, "test");

test("Unicode \\b rewrite matches Vietnamese words (lô đề)", () => {
  assert.ok(toJsRegex(String.raw`\blô đề\b`).test("chơi lô đề online"));
  assert.ok(!toJsRegex(String.raw`\bbet\b`).test("alphabet"));
});

test("BR-05: hard gambling keyword → score 1 and send", () => {
  const d = textDecision(rs, "Kèo bóng 88 — Thắng lớn", "LOW");
  assert.equal(d.hard, true);
  assert.equal(d.send, true);
  assert.equal(d.score, 1);
});

test("BR-02: thresholds per sensitivity level", () => {
  const text = "Doctors hate this miracle cure"; // f-hidden 0.5 + f-cure 0.6 → 0.8
  const score = rs.score(text);
  assert.ok(score > 0.7 && score < 0.9, `score=${score}`);
  for (const lvl of ["LOW", "MEDIUM", "HIGH"]) {
    assert.equal(textDecision(rs, text, lvl).send, score >= PROFILES[lvl].ruleThreshold);
  }
  const weak = "Shocking news today"; // 0.3
  assert.equal(textDecision(rs, weak, "HIGH").send, true);
  assert.equal(textDecision(rs, weak, "MEDIUM").send, false);
  assert.equal(textDecision(rs, weak, "LOW").send, false);
});

test("benign text stays local", () => {
  const d = textDecision(rs, "The city council approved the new budget on Monday.", "HIGH");
  assert.equal(d.score, 0);
  assert.equal(d.send, false);
});

test("BR-03: allowlist covers subdomains, not look-alikes", () => {
  const list = [{ domain: "example.com" }];
  assert.ok(isAllowlisted("example.com", list));
  assert.ok(isAllowlisted("news.example.com", list));
  assert.ok(!isAllowlisted("badexample.com", list));
  assert.ok(!isAllowlisted("", list));
});

test("normalizeDomain accepts URLs and rejects junk (UC4 2a)", () => {
  assert.equal(normalizeDomain("https://www.Example.com/path?q=1"), "www.example.com");
  assert.equal(normalizeDomain("example.com:8080"), "example.com");
  assert.equal(normalizeDomain("*.vnexpress.net"), "*.vnexpress.net");
  assert.equal(normalizeDomain("not a domain"), null);
  assert.equal(normalizeDomain("localhost"), null);
});

test("BR-08: fallback verdict is UNKNOWN, never BENIGN", () => {
  const v = unavailableVerdict();
  assert.equal(v.label, "UNKNOWN");
  assert.equal(v.confidence, 0);
  assert.equal(isPositive(v), false);
});

test("JS default rules mirror backend default_rules.py", () => {
  const py = readFileSync(new URL("../../backend/app/domain/default_rules.py", import.meta.url), "utf8");
  const pyIds = [...py.matchAll(/Rule\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(DEFAULT_RULES.map((r) => r.id), pyIds);
});

test("i18n: vi and en have the same keys; placeholders filled; fallback to vi", async () => {
  const { STRINGS, t, resolveLang } = await import("../lib/i18n.js");
  assert.deepEqual(Object.keys(STRINGS.vi).sort(), Object.keys(STRINGS.en).sort());
  assert.equal(t("en", "popup.statusItems", { n: 3 }), "3 item(s) need attention.");
  assert.equal(t("vi", "popup.statusItems", { n: 3 }), "3 mục cần chú ý.");
  assert.equal(resolveLang("fr"), "vi");
});
