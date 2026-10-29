import test from "node:test";
import assert from "node:assert/strict";
import { RuleSet } from "../lib/rules.js";
import { DEFAULT_RULES } from "../lib/default-rules.js";

const rs = new RuleSet(DEFAULT_RULES, "test");

test("Extended rules: detects gambling ads with varying diacritics", () => {
  const samples = [
    "Khuyến mãi nạp đầu 100% tại nhà cái uy tín",
    "Đăng ký tài khoản fb88 nhận quà tặng miễn phí",
    "Soi kèo bóng đá hôm nay thắng lớn",
  ];

  for (const text of samples) {
    const matches = rs.matching(text);
    const score = rs.score(text);
    assert.ok(score > 0, `Expected score > 0 for: ${text}`);
    assert.ok(matches.length > 0, `Expected matches for: ${text}`);
  }
});

test("Extended rules: benign texts produce zero score", () => {
  const benignSamples = [
    "Thủ tướng gặp mặt đại biểu thanh niên tiêu biểu toàn quốc",
    "Dự báo thời tiết Hà Nội và các tỉnh phía Bắc có mưa rải rác",
    "OpenAI công bố mô hình ngôn ngữ mới với khả năng suy luận vượt trội",
  ];

  for (const text of benignSamples) {
    const score = rs.score(text);
    assert.strictEqual(score, 0, `Expected zero score for benign: ${text}`);
  }
});
