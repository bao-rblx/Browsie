// Offline fallback copy of backend/app/domain/default_rules.py.
// At runtime the extension prefers the rules served by GET /config (the backend is the source of truth).
export const DEFAULT_RULES_VERSION = "1.0.0";

export const DEFAULT_RULES = [
  // Gambling (hard, BR-05)
  { id: "g-keo", pattern: String.raw`\bk[eè]o\s*(b[oó]ng|nh[aà]\s*c[aá]i)`, weight: 1.0, category: "GAMBLING" },
  { id: "g-nhacai", pattern: String.raw`\bnh[aà]\s*c[aá]i\b`, weight: 1.0, category: "GAMBLING" },
  { id: "g-brand", pattern: String.raw`\b(fb88|w88|m88|188bet|kubet|ku\s*casino|jun88|hi88|new88|f8bet|shbet|789bet|8xbet)\b`, weight: 1.0, category: "GAMBLING" },
  { id: "g-casino", pattern: String.raw`\b(online\s+casino|sports?\s*betting|bet\s+now)\b`, weight: 1.0, category: "GAMBLING" },
  // Gambling (soft)
  { id: "g-taixiu", pattern: String.raw`\b(t[aà]i\s*x[iỉ]u|n[oổ]\s*h[uũ]|b[aắ]n\s*c[aá]\s*(đổi|doi)\s*th[uư][oở]ng|l[oô]\s*đ[eề])\b`, weight: 0.6, category: "GAMBLING" },
  { id: "g-win", pattern: String.raw`(th[aắ]ng\s*l[oớ]n|jackpot|free\s*spins?|ho[aà]n\s*tr[aả]\s*\d+%)`, weight: 0.4, category: "GAMBLING" },
  // Spam
  { id: "s-money", pattern: String.raw`(ki[eế]m\s*ti[eề]n\s*(online|t[aạ]i\s*nh[aà])|make\s+\$?\d+\s*(a|per)\s*day|earn\s+money\s+fast)`, weight: 0.6, category: "SPAM" },
  { id: "s-urgent", pattern: String.raw`(click\s+here|nh[aấ]n\s+v[aà]o\s+đ[aâ]y|limited\s+time|ch[iỉ]\s+c[oò]n\s+h[oô]m\s+nay|act\s+now)`, weight: 0.35, category: "SPAM" },
  { id: "s-prize", pattern: String.raw`(you\s+(have\s+)?won|congratulations.{0,20}winner|tr[uú]ng\s+th[uư][oở]ng|qu[aà]\s+t[aặ]ng\s+mi[eễ]n\s+ph[ií])`, weight: 0.5, category: "SPAM" },
  { id: "s-contact", pattern: String.raw`(zalo|telegram|whatsapp)\s*[:\-]?\s*\+?\d[\d .]{7,}`, weight: 0.4, category: "SPAM" },
  { id: "s-crypto", pattern: String.raw`(x\d{2,}\s*l[oợ]i\s*nhu[aậ]n|guaranteed\s+returns?|double\s+your\s+(money|bitcoin))`, weight: 0.6, category: "SPAM" },
  // Fake news / sensational
  { id: "f-shock", pattern: String.raw`(s[oố]c|shocking|you\s+won'?t\s+believe|kh[oô]ng\s+th[eể]\s+tin\s+n[oổ]i)`, weight: 0.3, category: "FAKE_NEWS" },
  { id: "f-cure", pattern: String.raw`(ch[uữ]a\s+kh[oỏ]i\s+(ho[aà]n\s+to[aà]n\s+)?(ung\s+th[uư]|ti[eể]u\s+đ[uư][oờ]ng)|cures?\s+(cancer|diabetes)|miracle\s+cure)`, weight: 0.6, category: "FAKE_NEWS" },
  { id: "f-hidden", pattern: String.raw`(doctors\s+hate|b[aá]c\s+s[iĩ]\s+gi[aấ]u|what\s+they\s+don'?t\s+want\s+you\s+to\s+know|s[uự]\s+th[aậ]t\s+b[iị]\s+che\s+gi[aấ]u)`, weight: 0.5, category: "FAKE_NEWS" },
  { id: "f-share", pattern: String.raw`(share\s+before\s+(it'?s\s+)?deleted|chia\s+s[eẻ]\s+ngay\s+tr[uư][oớ]c\s+khi\s+b[iị]\s+x[oó]a)`, weight: 0.5, category: "FAKE_NEWS" },
];
