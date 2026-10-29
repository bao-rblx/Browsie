"""Seed RuleSet (VI + EN). Loaded into SQLite on first start; editable afterwards.

Weights: 1.0 = hard signal (BR-05 for gambling), 0.3–0.6 = soft evidence.
"""
from .models import Rule, RuleCategory, RuleSet

G, S, F = RuleCategory.GAMBLING, RuleCategory.SPAM, RuleCategory.FAKE_NEWS

RULESET_VERSION = "1.0.0"

DEFAULT_RULES = [
    # --- Gambling (hard) ---
    Rule("g-keo", r"\bk[eè]o\s*(b[oó]ng|nh[aà]\s*c[aá]i)", 1.0, G),
    Rule("g-nhacai", r"\bnh[aà]\s*c[aá]i\b", 1.0, G),
    Rule("g-brand", r"\b(fb88|w88|m88|188bet|kubet|ku\s*casino|jun88|hi88|new88|f8bet|shbet|789bet|8xbet)\b", 1.0, G),
    Rule("g-casino", r"\b(online\s+casino|sports?\s*betting|bet\s+now)\b", 1.0, G),
    # --- Gambling (soft) ---
    Rule("g-taixiu", r"\b(t[aà]i\s*x[iỉ]u|n[oổ]\s*h[uũ]|b[aắ]n\s*c[aá]\s*(đổi|doi)\s*th[uư][oở]ng|l[oô]\s*đ[eề])\b", 0.6, G),
    Rule("g-win", r"(th[aắ]ng\s*l[oớ]n|jackpot|free\s*spins?|ho[aà]n\s*tr[aả]\s*\d+%)", 0.4, G),
    # --- Spam ---
    Rule("s-money", r"(ki[eế]m\s*ti[eề]n\s*(online|t[aạ]i\s*nh[aà])|make\s+\$?\d+\s*(a|per)\s*day|earn\s+money\s+fast)", 0.6, S),
    Rule("s-urgent", r"(click\s+here|nh[aấ]n\s+v[aà]o\s+đ[aâ]y|limited\s+time|ch[iỉ]\s+c[oò]n\s+h[oô]m\s+nay|act\s+now)", 0.35, S),
    Rule("s-prize", r"(you\s+(have\s+)?won|congratulations.{0,20}winner|tr[uú]ng\s+th[uư][oở]ng|qu[aà]\s+t[aặ]ng\s+mi[eễ]n\s+ph[ií])", 0.5, S),
    Rule("s-contact", r"(zalo|telegram|whatsapp)\s*[:\-]?\s*\+?\d[\d .]{7,}", 0.4, S),
    Rule("s-crypto", r"(x\d{2,}\s*l[oợ]i\s*nhu[aậ]n|guaranteed\s+returns?|double\s+your\s+(money|bitcoin))", 0.6, S),
    # --- Fake news / sensational ---
    Rule("f-shock", r"(s[oố]c|shocking|you\s+won'?t\s+believe|kh[oô]ng\s+th[eể]\s+tin\s+n[oổ]i)", 0.3, F),
    Rule("f-cure", r"(ch[uữ]a\s+kh[oỏ]i\s+(ho[aà]n\s+to[aà]n\s+)?(ung\s+th[uư]|ti[eể]u\s+đ[uư][oờ]ng)|cures?\s+(cancer|diabetes)|miracle\s+cure)", 0.6, F),
    Rule("f-hidden", r"(doctors\s+hate|b[aá]c\s+s[iĩ]\s+gi[aấ]u|what\s+they\s+don'?t\s+want\s+you\s+to\s+know|s[uự]\s+th[aậ]t\s+b[iị]\s+che\s+gi[aấ]u)", 0.5, F),
    Rule("f-share", r"(share\s+before\s+(it'?s\s+)?deleted|chia\s+s[eẻ]\s+ngay\s+tr[uư][oớ]c\s+khi\s+b[iị]\s+x[oó]a)", 0.5, F),
]


def default_ruleset() -> RuleSet:
    return RuleSet(id="default", name="Browsie default", version=RULESET_VERSION, rules=list(DEFAULT_RULES))
