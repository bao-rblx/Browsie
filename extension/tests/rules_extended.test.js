import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../lib/rules.js";
import { DEFAULT_RULES } from "../lib/default-rules.js";

test("Extended rules: detects gambling ads with varying diacritics", () => {
  const samples = [
    "Khuyến mãi nạp đầu 100% tại nhà cái uy tín",
    "Link vào casino bóng đá nhận code tân thủ",
    "Soi cầu tài xỉu chuẩn xác 99%",
  ];

  for (const text of samples) {
    const res = evaluateRules(text, DEFAULT_RULES);
    assert.ok(res.score > 0, `Expected score > 0 for: ${text}`);
    assert.ok(res.matches.length > 0, `Expected matches for: ${text}`);
  }
});

test("Extended rules: benign texts produce zero score", () => {
  const benignSamples = [
    "Thủ tướng gặp mặt đại biểu thanh niên tiêu biểu toàn quốc",
    "Dự báo thời tiết Hà Nội và các tỉnh phía Bắc có mưa rải rác",
    "OpenAI công bố mô hình ngôn ngữ mới với khả năng suy luận vượt trội",
  ];

  for (const text of benignSamples) {
    const res = evaluateRules(text, DEFAULT_RULES);
    assert.strictEqual(res.score, 0, `Expected zero score for benign: ${text}`);
  }
});
