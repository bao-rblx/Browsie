// Options page: settings, language, allowlist (UC4) and detection history (UC5).
import { applyI18n, locale, t } from "../lib/i18n.js";
import { hostOf, normalizeDomain } from "../lib/policy.js";
import { clearHistory, getHistory, getSettings, saveSettings } from "../lib/storage.js";

const $ = (id) => document.getElementById(id);
const selected = new Set();
let lang = "vi";

async function render() {
  const s = await getSettings();
  lang = s.lang;
  applyI18n(document, lang);
  document.title = t(lang, "opt.pageTitle");
  $("lang").value = lang;
  $("enabled").checked = s.enabled;
  $("ocrEnabled").checked = s.ocrEnabled;
  $("sensitivity").value = s.sensitivity;
  $("backendUrl").value = s.backendUrl;
  $("apiToken").value = s.apiToken;
  renderAllowlist(s.allowlist);
  renderHistory(await getHistory());
}

function renderAllowlist(list) {
  const ul = $("alList");
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = t(lang, "opt.noAllowlist");
    ul.append(li);
    return;
  }
  for (const entry of list) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = entry.domain;
    const rm = document.createElement("button");
    rm.textContent = t(lang, "opt.remove");
    rm.setAttribute("aria-label", t(lang, "opt.removeAria", { domain: entry.domain }));
    rm.addEventListener("click", async () => {
      const s = await getSettings();
      await saveSettings({ allowlist: s.allowlist.filter((e) => e.domain !== entry.domain) });
    });
    li.append(name, rm);
    ul.append(li);
  }
}

function renderHistory(entries) {
  const body = $("histBody");
  body.replaceChildren();
  $("histTable").hidden = !entries.length;
  $("histEmpty").hidden = !!entries.length;
  for (const id of [...selected]) if (!entries.some((e) => e.id === id)) selected.delete(id);
  const fmt = new Intl.DateTimeFormat(locale(lang), { dateStyle: "short", timeStyle: "medium" });

  for (const e of entries) {
    const tr = document.createElement("tr");
    const when = fmt.format(new Date(e.timestamp));

    const cbCell = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(e.id);
    cb.setAttribute("aria-label", t(lang, "opt.selectEntry", { time: when }));
    cb.addEventListener("change", () => {
      cb.checked ? selected.add(e.id) : selected.delete(e.id);
      $("clearSelected").disabled = !selected.size;
    });
    cbCell.append(cb);

    const time = document.createElement("td");
    time.textContent = when;
    const src = document.createElement("td");
    src.textContent = t(lang, `source.${e.sourceType === "IMAGE" ? "IMAGE" : "TEXT"}`);
    const label = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `label-pill label-${e.label}`;
    pill.textContent = t(lang, `label.${e.label}`);
    label.append(pill);
    const conf = document.createElement("td");
    conf.textContent = `${Math.round((e.confidence || 0) * 100)}%`;
    const site = document.createElement("td");
    site.className = "site";
    const host = document.createElement("strong");
    host.textContent = hostOf(e.url) || e.url;
    const why = document.createElement("div");
    why.className = "muted";
    why.textContent = e.rationale || "";
    site.append(host, why);

    tr.append(cbCell, time, src, label, conf, site);
    body.append(tr);
  }
  $("clearSelected").disabled = !selected.size;
  $("selectAll").checked = entries.length > 0 && selected.size === entries.length;
}

// ---- general
$("lang").addEventListener("change", (e) => saveSettings({ lang: e.target.value }));
$("enabled").addEventListener("change", (e) => saveSettings({ enabled: e.target.checked }));
$("ocrEnabled").addEventListener("change", (e) => saveSettings({ ocrEnabled: e.target.checked }));
$("sensitivity").addEventListener("change", (e) => saveSettings({ sensitivity: e.target.value }));

// ---- allowlist (UC4 alt 2a: invalid domain → inline error, not saved)
$("alForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const domain = normalizeDomain($("alInput").value);
  if (!domain) {
    $("alErr").textContent = t(lang, "opt.invalidDomain");
    $("alInput").setAttribute("aria-invalid", "true");
    return;
  }
  $("alErr").textContent = "";
  $("alInput").removeAttribute("aria-invalid");
  $("alInput").value = "";
  const s = await getSettings();
  if (!s.allowlist.some((e) => e.domain === domain)) {
    await saveSettings({ allowlist: [...s.allowlist, { domain, addedAt: Date.now(), reason: "Options page" }] });
  }
});

// ---- history
$("selectAll").addEventListener("change", async (e) => {
  const entries = await getHistory();
  selected.clear();
  if (e.target.checked) entries.forEach((x) => selected.add(x.id));
  renderHistory(entries);
});
$("clearSelected").addEventListener("click", async () => {
  await clearHistory([...selected]);
  selected.clear();
  render();
});
$("clearAll").addEventListener("click", async () => {
  if (!confirm(t(lang, "opt.confirmClear"))) return;
  await clearHistory();
  selected.clear();
  render();
});

// ---- backend
$("beForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const url = $("backendUrl").value.trim();
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    $("beStatus").textContent = t(lang, "opt.invalidUrl");
    return;
  }
  await saveSettings({ backendUrl: url, apiToken: $("apiToken").value.trim() });
  $("beStatus").textContent = t(lang, "opt.saved");
});
$("testBackend").addEventListener("click", async () => {
  $("beStatus").textContent = t(lang, "opt.testing");
  const res = await chrome.runtime.sendMessage({ type: "health" });
  $("beStatus").textContent = res?.ok
    ? t(lang, "opt.connected", { model: res.llm, version: res.rulesetVersion })
    : t(lang, "opt.failed", { error: res?.error });
});
$("reloadRules").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "reloadRules" });
  $("beStatus").textContent = res?.error
    ? t(lang, "opt.failed", { error: res.error })
    : t(lang, "opt.rulesLoaded", { count: res.count, version: res.version });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.history || changes.settings)) render();
});

render();
