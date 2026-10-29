// Background service worker: rule pre-filter, backend calls, context menu, OCR orchestration,
// per-tab detection state and badge.
import { api } from "./lib/api.js";
import { DEFAULT_RULES, DEFAULT_RULES_VERSION } from "./lib/default-rules.js";
import {
  LABEL_TEXT, hostOf, isAllowlisted, isPositive, localGamblingVerdict, textDecision, unavailableVerdict,
} from "./lib/policy.js";
import { RuleSet } from "./lib/rules.js";
import { addHistory, getSettings, saveSettings } from "./lib/storage.js";
import { STRINGS, t } from "./lib/i18n.js";

const MENU_ID = "browsie-analyze-image";
const RULES_MAX_AGE_MS = 60 * 60 * 1000;
const TEXT_TTL_MS = 10 * 60 * 1000; // BR-06 (client-side mirror of the backend cache)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------- install / consent

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const s = await getSettings();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: t(s.lang, "menu.analyze"), contexts: ["image"] });
  });
  if (reason === "install" || !s.consented) chrome.tabs.create({ url: "consent/consent.html" });
  refreshBadges();
});

chrome.runtime.onStartup.addListener(refreshBadges);

// ---------------------------------------------------------------- rules

let rulesetPromise = null;

async function loadRuleset() {
  const { rulesCache } = await chrome.storage.local.get("rulesCache");
  if (rulesCache && Date.now() - rulesCache.fetchedAt < RULES_MAX_AGE_MS) {
    return new RuleSet(rulesCache.rules, rulesCache.version);
  }
  try {
    const cfg = await api.config(await getSettings());
    await chrome.storage.local.set({
      rulesCache: { rules: cfg.rules, version: cfg.rulesetVersion, fetchedAt: Date.now() },
    });
    return new RuleSet(cfg.rules, cfg.rulesetVersion);
  } catch {
    // Backend offline: use the last known rules, else the bundled copy. Retry on next wake-up.
    rulesetPromise = null;
    return rulesCache
      ? new RuleSet(rulesCache.rules, rulesCache.version)
      : new RuleSet(DEFAULT_RULES, DEFAULT_RULES_VERSION);
  }
}

function getRuleset() {
  rulesetPromise ??= loadRuleset();
  return rulesetPromise;
}

// ---------------------------------------------------------------- per-tab state (storage.session)

const tabKey = (tabId) => `tab:${tabId}`;
const locks = new Map();

/** Serialise read-modify-write on a tab's state so concurrent messages don't clobber each other. */
function withTab(tabId, fn) {
  const prev = locks.get(tabId) || Promise.resolve();
  const next = prev.then(async () => {
    const key = tabKey(tabId);
    const state = (await chrome.storage.session.get(key))[key] || { url: "", items: [] };
    const out = await fn(state);
    await chrome.storage.session.set({ [key]: state });
    return out;
  });
  locks.set(tabId, next.catch(() => {}));
  return next;
}

async function getTabState(tabId) {
  const key = tabKey(tabId);
  return (await chrome.storage.session.get(key))[key] || { url: "", items: [] };
}

async function resetTab(tabId, url = "") {
  await withTab(tabId, (state) => { state.url = url; state.items = []; });
  await updateBadge(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(tabKey(tabId)));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" && info.url) resetTab(tabId, info.url);
});

// ---------------------------------------------------------------- badge

async function updateBadge(tabId) {
  const s = await getSettings();
  if (!s.enabled) {
    await chrome.action.setBadgeText({ tabId, text: "off" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#888" });
    return;
  }
  const { items } = await getTabState(tabId);
  const positives = items.filter((i) => isPositive(i.verdict)).length;
  const unknown = items.some((i) => i.verdict.label === "UNKNOWN");
  await chrome.action.setBadgeText({ tabId, text: positives ? String(positives) : unknown ? "?" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: positives ? "#d93025" : "#f29900" });
}

async function refreshBadges() {
  for (const tab of await chrome.tabs.query({})) updateBadge(tab.id).catch(() => {});
}

// Settings changed anywhere (popup / options / consent) → clear tab state and tell pages to re-scan.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const oldS = changes.settings.oldValue || {};
  const newS = changes.settings.newValue || {};
  if (oldS.lang !== newS.lang) {
    chrome.contextMenus.update(MENU_ID, { title: t(newS.lang, "menu.analyze") }, () => void chrome.runtime.lastError);
  }
  if (oldS.backendUrl !== newS.backendUrl) {
    await chrome.storage.local.remove("rulesCache");
    rulesetPromise = null;
  }
  textCache.clear();
  for (const tab of await chrome.tabs.query({})) {
    await resetTab(tab.id, tab.url || "").catch(() => {});
    chrome.tabs.sendMessage(tab.id, { type: "settingsChanged" }).catch(() => {});
  }
});

// ---------------------------------------------------------------- text path (UC1)

const textCache = new Map(); // text → { verdict, expires }

function cacheGet(text) {
  const hit = textCache.get(text);
  if (!hit) return null;
  if (Date.now() > hit.expires) { textCache.delete(text); return null; }
  return { ...hit.verdict, cacheHit: true, llmCalled: false };
}

function cachePut(text, verdict) {
  if (verdict.label === "UNKNOWN") return; // never cache failures
  if (textCache.size > 2000) textCache.delete(textCache.keys().next().value);
  textCache.set(text, { verdict, expires: Date.now() + TEXT_TTL_MS });
}

/** Precondition checks shared by both paths. Returns a reason string when scanning must stop. */
function blockedReason(s, url) {
  if (!s.consented) return "consent";
  if (!s.enabled) return "disabled";
  if (isAllowlisted(hostOf(url), s.allowlist)) return "allowlisted"; // BR-03
  return null;
}

async function analyzeChunk(s, ruleset, text, url) {
  const cached = cacheGet(text);
  if (cached) return cached;
  const d = textDecision(ruleset, text, s.sensitivity);
  if (!d.send) {
    // BR-02: below threshold → benign locally; the text never leaves the device.
    return { label: "BENIGN", confidence: 1 - d.score, rationale: t(s.lang, "why.noSuspicious"), ruleScore: d.score, llmCalled: false };
  }
  try {
    const v = await api.analyzeText(s, text, url);
    cachePut(text, v);
    return v;
  } catch (e) {
    console.warn("[Browsie] analyze-text failed:", e.message);
    return d.hard ? localGamblingVerdict(t(s.lang, "why.gamblingText")) : unavailableVerdict(t(s.lang, "why.unavailable")); // BR-05 / BR-08
  }
}

async function scanChunks(tab, chunks) {
  const s = await getSettings();
  const reason = blockedReason(s, tab.url);
  if (reason) return { skipped: reason };

  const ruleset = await getRuleset();
  const verdicts = {};
  // Small concurrency limit so a long page doesn't fire dozens of requests at once.
  const queue = [...chunks];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const c = queue.shift();
      verdicts[c.id] = await analyzeChunk(s, ruleset, c.text, tab.url);
    }
  });
  await Promise.all(workers);

  const flagged = chunks.filter((c) => verdicts[c.id].label !== "BENIGN");
  if (flagged.length) {
    const now = Date.now();
    await withTab(tab.id, (state) => {
      state.url = tab.url;
      for (const c of flagged) {
        state.items = state.items.filter((i) => i.id !== c.id);
        state.items.push({ id: c.id, kind: "text", snippet: c.text.slice(0, 160), verdict: verdicts[c.id], ts: now });
      }
    });
    await addHistory(flagged.filter((c) => !verdicts[c.id].cacheHit).map((c) => historyEntry("TEXT", tab.url, verdicts[c.id], c.text)));
    await updateBadge(tab.id);
  }
  return { verdicts };
}

function historyEntry(sourceType, url, v, snippet = "") {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    sourceType,
    url,
    label: v.label,
    confidence: v.confidence,
    rationale: v.rationale,
    snippet: snippet.slice(0, 160),
  };
}

// ---------------------------------------------------------------- image path (UC2)

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id >= 0) analyzeImage(info, tab);
});

async function analyzeImage(info, tab) {
  const send = (msg) => chrome.tabs.sendMessage(tab.id, msg, { frameId: info.frameId ?? 0 }).catch(() => {});
  const s = await getSettings();
  const reason = blockedReason(s, tab.url);
  if (reason === "consent") return chrome.tabs.create({ url: "consent/consent.html" });
  if (reason === "disabled") return send({ type: "toast", text: t(s.lang, "bg.off") });
  if (reason === "allowlisted") return send({ type: "toast", text: t(s.lang, "bg.allowlisted", { host: hostOf(tab.url) }) });

  const itemId = "img-" + crypto.randomUUID().slice(0, 8);
  send({ type: "imageStatus", status: "analyzing", srcUrl: info.srcUrl, itemId });

  let verdict;
  let ocrText = "";
  try {
    const { dataUrl, mimeType } = await readImage(info.srcUrl, tab.id, info.frameId ?? 0);
    if (s.ocrEnabled) ocrText = await runOcr(dataUrl); // BR-07: empty OCR still continues
    const ruleset = await getRuleset();
    try {
      verdict = await api.analyzeImage(s, { imageBase64: dataUrl, mimeType, ocrText }, tab.url); // BR-01
    } catch (e) {
      console.warn("[Browsie] analyze-image failed:", e.message);
      verdict = ruleset.hasHardGamblingHit(ocrText)
        ? localGamblingVerdict(t(s.lang, "why.gamblingImage"))
        : unavailableVerdict(t(s.lang, "why.unavailable"));
    }
  } catch (e) {
    console.warn("[Browsie] could not read image:", e.message);
    verdict = unavailableVerdict(t(s.lang, "why.cantRead", { error: e.message }));
  }
  verdict.ocrText = ocrText;

  await withTab(tab.id, (state) => {
    state.url = tab.url;
    state.items.push({ id: itemId, kind: "image", snippet: ocrText.slice(0, 160) || info.srcUrl.slice(0, 160), verdict, ts: Date.now() });
  });
  await addHistory([historyEntry("IMAGE", tab.url, verdict, ocrText)]);
  await updateBadge(tab.id);
  send({ type: "imageStatus", status: "done", srcUrl: info.srcUrl, itemId, verdict });
}

async function readImage(src, tabId, frameId) {
  let blob;
  if (src.startsWith("blob:")) {
    // blob: URLs belong to the page's origin, so only the content script can read them.
    const res = await chrome.tabs.sendMessage(tabId, { type: "readBlob", src }, { frameId });
    if (!res?.dataUrl) throw new Error(res?.error || "blob not readable");
    blob = await (await fetch(res.dataUrl)).blob();
  } else {
    const res = await fetch(src, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("image larger than 5 MB");
  const mimeType = blob.type.startsWith("image/") ? blob.type : "image/png";
  return { dataUrl: `data:${mimeType};base64,${await toBase64(blob)}`, mimeType };
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------- OCR (Offscreen Document)

let creatingOffscreen = null;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen/offscreen.html");
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (existing.length) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({ url: "offscreen/offscreen.html", reasons: ["WORKERS"], justification: "Run Tesseract.js OCR on images the user selected" })
    .finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function runOcr(dataUrl) {
  try {
    await ensureOffscreen();
    const res = await Promise.race([
      chrome.runtime.sendMessage({ target: "offscreen", type: "ocr", dataUrl }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("OCR timeout")), 30000)),
    ]);
    if (res?.error) throw new Error(res.error);
    return (res?.text || "").trim();
  } catch (e) {
    console.warn("[Browsie] OCR failed, continuing image-only:", e.message);
    return "";
  }
}

// ---------------------------------------------------------------- messages

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false; // meant for the offscreen document
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg, sender))
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

const handlers = {
  // content → bg
  scanChunks: (msg, sender) => scanChunks(sender.tab, msg.chunks || []),
  dismiss: async (msg, sender) => {
    await withTab(sender.tab.id, (st) => { st.items = st.items.filter((i) => i.id !== msg.itemId); });
    await updateBadge(sender.tab.id);
    return { ok: true };
  },

  // popup / options / content → bg
  allowlistDomain: async (msg) => {
    const s = await getSettings();
    if (!s.allowlist.some((e) => e.domain === msg.domain)) {
      await saveSettings({ allowlist: [...s.allowlist, { domain: msg.domain, addedAt: Date.now(), reason: msg.reason || "" }] });
    }
    return { ok: true };
  },
  getTabState: async (msg) => {
    const { lang } = await getSettings();
    const dict = STRINGS[lang] || STRINGS.en;
    const labels = Object.fromEntries(Object.keys(LABEL_TEXT).map((k) => [k, dict[`label.${k}`] || LABEL_TEXT[k]]));
    return { ...(await getTabState(msg.tabId)), labels };
  },
  dismissItem: async (msg) => {
    await withTab(msg.tabId, (st) => { st.items = st.items.filter((i) => i.id !== msg.itemId); });
    await updateBadge(msg.tabId);
    chrome.tabs.sendMessage(msg.tabId, { type: "dismissItem", itemId: msg.itemId }).catch(() => {});
    return { ok: true };
  },
  health: async () => {
    try { return { ok: true, ...(await api.health(await getSettings())) }; }
    catch (e) { return { ok: false, error: e.message }; }
  },
  reloadRules: async () => {
    await chrome.storage.local.remove("rulesCache");
    rulesetPromise = null;
    const rs = await getRuleset();
    return { version: rs.version, count: rs.rules.length };
  },
};
