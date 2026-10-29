// Content script (F-01, F-05): extracts visible text, asks the background to scan it,
// highlights flagged blocks, blurs flagged images and shows rationale popovers.
// Classic script (MV3 content scripts can't be ES modules) — wrapped in an IIFE.
(() => {
  if (window.__browsieLoaded) return;
  window.__browsieLoaded = true;

  const MIN_CHARS = 40;
  const MAX_CHARS = 2000;
  const MAX_CHUNKS_PER_SCAN = 150;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE", "SVG", "CANVAS", "IFRAME"]);
  const BLOCK_TAGS = new Set(["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TD", "TH", "DD", "DT", "FIGCAPTION", "ARTICLE", "SECTION", "DIV", "SPAN", "A"]);
  const POSITIVE = new Set(["SPAM", "FAKE_NEWS", "GAMBLING_AD"]);

  // i18n: strings live in lib/i18n.js (loaded as a web-accessible module); language from settings.
  let i18n = null;
  let lang = "vi";
  const T = (key, vars) => (i18n ? i18n.t(lang, key, vars) : key);
  const L = (label) => T(`label.${label}`);

  async function loadI18n() {
    i18n ??= await import(chrome.runtime.getURL("lib/i18n.js"));
    const { settings } = await chrome.storage.local.get("settings");
    lang = i18n.resolveLang(settings?.lang);
  }

  let scanned = new WeakSet();     // elements already sent this page-load
  const byId = new Map();          // chunk/item id → element
  let nextId = 1;
  let lastContextTarget = null;    // element under the last right-click (for image analysis)

  // ------------------------------------------------------------ extraction (F-01)

  const normalize = (s) => s.replace(/\s+/g, " ").trim();

  function isVisible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }

  /** Nearest block-ish ancestor that holds the text node. */
  function blockOf(node) {
    let el = node.parentElement;
    while (el && el !== document.body) {
      if (el.closest("[data-browsie-ui]")) return null;
      if (SKIP_TAGS.has(el.tagName) || el.isContentEditable) return null;
      if (BLOCK_TAGS.has(el.tagName)) {
        const display = getComputedStyle(el).display;
        if (!display.startsWith("inline") || el.tagName === "A") return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function collectChunks(root = document.body) {
    const blocks = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim().length > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n && blocks.size < MAX_CHUNKS_PER_SCAN * 3; n = walker.nextNode()) {
      const b = blockOf(n);
      if (b && !scanned.has(b)) blocks.add(b);
    }
    // Keep the innermost blocks only, so a <div> and its <p> aren't both sent.
    const inner = [...blocks].filter((b) => ![...blocks].some((o) => o !== b && b.contains(o)));
    const seen = new Set();
    const chunks = [];
    for (const el of inner) {
      if (chunks.length >= MAX_CHUNKS_PER_SCAN) break;
      scanned.add(el);
      const text = normalize(el.innerText || "").slice(0, MAX_CHARS);
      if (text.length < MIN_CHARS || seen.has(text) || !isVisible(el)) continue;
      seen.add(text);
      const id = "t" + nextId++;
      byId.set(id, el);
      chunks.push({ id, text });
    }
    return chunks;
  }

  async function scan(root) {
    const chunks = collectChunks(root);
    if (!chunks.length) return;
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "scanChunks", chunks });
    } catch {
      return; // extension reloaded / context invalidated
    }
    if (!res?.verdicts) return;
    for (const [id, v] of Object.entries(res.verdicts)) {
      if (v.label !== "BENIGN") flagText(id, v);
    }
  }

  // ------------------------------------------------------------ interventions (F-05)

  function flagText(id, verdict) {
    const el = byId.get(id);
    if (!el || el.dataset.browsieId) return;
    el.dataset.browsieId = id;
    el.classList.add("browsie-flag", POSITIVE.has(verdict.label) ? "browsie-flag--bad" : "browsie-flag--unknown");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.dataset.browsieUi = "";
    chip.className = "browsie-chip";
    chip.textContent = "⚠ " + L(verdict.label);
    chip.setAttribute("aria-label", T("cs.chipAria", { label: L(verdict.label) }));
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPopover(chip, id, verdict);
    });
    el.prepend(chip);
  }

  function unflagText(id) {
    const el = byId.get(id);
    if (!el) return;
    el.classList.remove("browsie-flag", "browsie-flag--bad", "browsie-flag--unknown");
    delete el.dataset.browsieId;
    el.querySelector(":scope > .browsie-chip")?.remove();
  }

  function pct(c) { return Math.round((c || 0) * 100) + "%"; }

  let openPopover = null;
  function closePopover() { openPopover?.remove(); openPopover = null; }
  document.addEventListener("click", (e) => { if (openPopover && !openPopover.contains(e.target)) closePopover(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); });

  function showPopover(anchor, id, verdict) {
    closePopover();
    const pop = document.createElement("div");
    pop.dataset.browsieUi = "";
    pop.className = "browsie-popover";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", T("cs.dialogAria"));
    const title = document.createElement("strong");
    title.textContent = `${L(verdict.label)}${verdict.label === "UNKNOWN" ? "" : " — " + pct(verdict.confidence)}`;
    const why = document.createElement("p");
    why.textContent = verdict.rationale || "";
    const row = document.createElement("div");
    row.className = "browsie-popover__actions";
    const dismiss = button(T("common.dismiss"), () => { dismiss_(id); closePopover(); });
    const allow = button(T("cs.trust", { host: location.hostname }), async () => {
      await chrome.runtime.sendMessage({ type: "allowlistDomain", domain: location.hostname, reason: "From page warning" });
      closePopover();
    });
    row.append(dismiss, allow);
    pop.append(title, why, row);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${window.scrollY + r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + innerWidth - 340))}px`;
    openPopover = pop;
    dismiss.focus();
  }

  function button(text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function dismiss_(id) {
    if (id.startsWith("img-")) unblurImage(id); else unflagText(id);
    chrome.runtime.sendMessage({ type: "dismiss", itemId: id }).catch(() => {});
  }

  // ------------------------------------------------------------ images (UC2)

  document.addEventListener("contextmenu", (e) => { lastContextTarget = e.target; }, true);

  function findImage(srcUrl) {
    const t = lastContextTarget;
    if (t instanceof HTMLImageElement && (t.currentSrc === srcUrl || t.src === srcUrl)) return t;
    return [...document.images].find((img) => img.currentSrc === srcUrl || img.src === srcUrl) || null;
  }

  const overlays = new Map(); // itemId → { img, box }

  function placeOverlay(img, box) {
    const r = img.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${window.scrollY + r.top}px`, left: `${window.scrollX + r.left}px`,
      width: `${Math.max(r.width, 120)}px`, height: `${Math.max(r.height, 60)}px`,
    });
  }

  let rafPending = false;
  function repositionAll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      for (const { img, box } of overlays.values()) {
        if (!img.isConnected) { box.remove(); continue; }
        placeOverlay(img, box);
      }
    });
  }
  window.addEventListener("scroll", repositionAll, { passive: true, capture: true });
  window.addEventListener("resize", repositionAll, { passive: true });

  function makeOverlay(itemId, img) {
    const box = document.createElement("div");
    box.dataset.browsieUi = "";
    box.className = "browsie-overlay";
    document.body.append(box);
    overlays.set(itemId, { img, box });
    placeOverlay(img, box);
    return box;
  }

  function onImageStatus({ status, srcUrl, itemId, verdict }) {
    const img = findImage(srcUrl);
    if (status === "analyzing") {
      if (!img) return toast(T("cs.analyzingToast"));
      const box = makeOverlay(itemId, img);
      box.classList.add("browsie-overlay--busy");
      box.textContent = T("cs.analyzing");
      box.setAttribute("role", "status");
      return;
    }
    const entry = overlays.get(itemId);
    if (!POSITIVE.has(verdict.label)) {
      entry?.box.remove();
      overlays.delete(itemId);
      if (verdict.label === "UNKNOWN") toast(`⚠ ${verdict.rationale}`, true);
      else toast(T("cs.noIssues", { pct: pct(verdict.confidence) }));
      return;
    }
    if (!img) return toast(`⚠ ${L(verdict.label)} (${pct(verdict.confidence)}): ${verdict.rationale}`, true);
    const box = entry?.box || makeOverlay(itemId, img);
    box.classList.remove("browsie-overlay--busy");
    box.classList.add("browsie-overlay--bad");
    box.replaceChildren();
    box.setAttribute("role", "alert");
    img.classList.add("browsie-blur");
    img.dataset.browsieId = itemId;
    const title = document.createElement("strong");
    title.textContent = T("cs.detected", { label: L(verdict.label), pct: pct(verdict.confidence) });
    const why = document.createElement("p");
    why.textContent = verdict.rationale;
    const row = document.createElement("div");
    row.className = "browsie-popover__actions";
    row.append(button(T("cs.showImage"), () => dismiss_(itemId)));
    box.append(title, why, row);
  }

  function unblurImage(itemId) {
    const entry = overlays.get(itemId);
    if (!entry) return;
    entry.img.classList.remove("browsie-blur");
    entry.box.remove();
    overlays.delete(itemId);
  }

  async function readBlob(src) {
    const blob = await (await fetch(src)).blob();
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  // ------------------------------------------------------------ toast

  function toast(text, warn = false) {
    const t = document.createElement("div");
    t.dataset.browsieUi = "";
    t.className = "browsie-toast" + (warn ? " browsie-toast--warn" : "");
    t.setAttribute("role", "status");
    t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ------------------------------------------------------------ messages

  function resetPage() {
    closePopover();
    for (const id of byId.keys()) unflagText(id);
    for (const id of [...overlays.keys()]) unblurImage(id);
    byId.clear();
    scanned = new WeakSet();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case "imageStatus": onImageStatus(msg); break;
      case "toast": toast(msg.text, true); break;
      case "dismissItem": msg.itemId.startsWith("img-") ? unblurImage(msg.itemId) : unflagText(msg.itemId); break;
      case "settingsChanged": resetPage(); loadI18n().catch(() => {}).finally(() => scan()); break;
      case "readBlob":
        readBlob(msg.src).then((dataUrl) => sendResponse({ dataUrl }), (e) => sendResponse({ error: String(e) }));
        return true;
    }
    return false;
  });

  // ------------------------------------------------------------ start + watch for new content

  let pending = null;
  const observer = new MutationObserver((muts) => {
    if (muts.every((m) => [...m.addedNodes].every((n) => n.nodeType !== 1 || n.closest?.("[data-browsie-ui]")))) return;
    clearTimeout(pending);
    pending = setTimeout(() => scan(), 1500);
  });

  // Load strings first (falls back to keys if the module can't load), then start.
  loadI18n().catch((e) => console.warn("[Browsie] i18n load failed:", e)).finally(() => {
    if (window.top === window) { // top frame only, to keep request volume low
      scan();
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });
  // Language changes made in popup/options apply to already-open pages.
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.settings) loadI18n().catch(() => {});
  });
})();
