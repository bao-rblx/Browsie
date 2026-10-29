// Fake chrome.* API for UI preview only (dev/serve.mjs injects it). Seeds sample settings,
// history and per-tab warnings, and runs the real client-side rules for the demo page scan.
(() => {
  const now = Date.now();
  const store = {
    settings: {
      enabled: true, consented: true, sensitivity: "MEDIUM", ocrEnabled: true,
      allowlist: [{ domain: "vnexpress.net", addedAt: now - 864e5, reason: "Options page" },
                  { domain: "wikipedia.org", addedAt: now - 3 * 864e5, reason: "From popup" }],
      backendUrl: "http://localhost:8000", apiToken: "",
    },
    history: [
      { id: "h1", timestamp: now - 6e4, sourceType: "IMAGE", url: "https://kenh-tin-nong.example/bai-viet", label: "GAMBLING_AD", confidence: 0.92, rationale: "Gambling keywords detected in image text" },
      { id: "h2", timestamp: now - 3e5, sourceType: "TEXT", url: "https://kenh-tin-nong.example/bai-viet", label: "FAKE_NEWS", confidence: 0.81, rationale: "Unsourced miracle-cure health claim" },
      { id: "h3", timestamp: now - 36e5, sourceType: "TEXT", url: "https://forum.example.com/t/123", label: "SPAM", confidence: 0.77, rationale: "Get-rich-quick offer with a Zalo contact number" },
      { id: "h4", timestamp: now - 72e5, sourceType: "TEXT", url: "https://blog.example.org/post", label: "UNKNOWN", confidence: 0, rationale: "Service unavailable — tap to retry" },
    ],
  };
  if (location.search.includes("consent=0")) store.settings.consented = false;

  const tabItems = [
    { id: "img-1", kind: "image", snippet: "Kèo bóng 88 — Thắng lớn, hoàn trả 10%", ts: now - 6e4, verdict: { label: "GAMBLING_AD", confidence: 0.92, rationale: "Gambling keywords detected in image text" } },
    { id: "t3", kind: "text", snippet: "Bác sĩ giấu kín: loại lá này chữa khỏi hoàn toàn tiểu đường chỉ sau 7 ngày…", ts: now - 3e5, verdict: { label: "FAKE_NEWS", confidence: 0.81, rationale: "Unsourced miracle-cure health claim" } },
  ];

  const changeListeners = [];
  const area = (data, name) => ({
    async get(keys) {
      if (keys == null) return { ...data };
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = structuredClone(v); }
      changeListeners.forEach((fn) => fn(changes, name));
    },
    async remove(k) { for (const key of [].concat(k)) delete data[key]; },
  });

  const msgListeners = [];
  let libs;
  const loadLibs = () => (libs ??= Promise.all([
    import("/lib/rules.js"), import("/lib/policy.js"), import("/lib/default-rules.js"),
  ]).then(([r, p, d]) => ({ rs: new r.RuleSet(d.DEFAULT_RULES, d.DEFAULT_RULES_VERSION), p })));

  const handlers = {
    async getTabState() {
      const { LABEL_TEXT } = (await loadLibs()).p;
      return { url: "https://kenh-tin-nong.example/bai-viet", items: tabItems, labels: LABEL_TEXT };
    },
    async health() { return { ok: true, llm: "gemini-2.5-flash", rulesetVersion: "1.0.0" }; },
    async dismissItem({ itemId }) { const i = tabItems.findIndex((x) => x.id === itemId); if (i >= 0) tabItems.splice(i, 1); return { ok: true }; },
    async dismiss() { return { ok: true }; },
    async allowlistDomain({ domain, reason }) {
      store.settings = { ...store.settings, allowlist: [...store.settings.allowlist, { domain, addedAt: Date.now(), reason }] };
      return { ok: true };
    },
    async reloadRules() { const { rs } = await loadLibs(); return { version: rs.version, count: rs.rules.length }; },
    async scanChunks({ chunks }) {
      // Real local pre-filter; the "LLM" step is simulated with the dominant rule category.
      const { rs, p } = await loadLibs();
      const verdicts = {};
      for (const c of chunks) {
        const d = p.textDecision(rs, c.text, store.settings.sensitivity);
        if (!d.send) { verdicts[c.id] = { label: "BENIGN", confidence: 1 - d.score }; continue; }
        const cat = rs.dominantCategory(c.text);
        const label = { GAMBLING: "GAMBLING_AD", SPAM: "SPAM", FAKE_NEWS: "FAKE_NEWS" }[cat] || "UNKNOWN";
        verdicts[c.id] = { label, confidence: Math.max(0.7, d.score), rationale: `[preview] Matched ${cat?.toLowerCase()} patterns (rule score ${d.score.toFixed(2)})` };
      }
      await new Promise((r) => setTimeout(r, 400));
      return { verdicts };
    },
  };

  window.chrome = {
    storage: {
      local: area(store, "local"),
      session: area({}, "session"),
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
    runtime: {
      getURL: (p) => "/" + p.replace(/^\//, ""),
      openOptionsPage: () => window.open("/options/options.html", "_blank"),
      sendMessage: async (msg) => (handlers[msg?.type] ? handlers[msg.type](msg) : undefined),
      onMessage: { addListener: (fn) => msgListeners.push(fn) },
    },
    tabs: {
      query: async () => [{ id: 1, url: "https://kenh-tin-nong.example/bai-viet" }],
      create: ({ url }) => window.open(url.startsWith("/") ? url : "/" + url, "_blank"),
      sendMessage: async () => {},
    },
  };

  // Lets the demo page push messages to the content script as if they came from the background.
  window.__browsieSimulate = (msg) => msgListeners.forEach((fn) => fn(msg, {}, () => {}));
})();
