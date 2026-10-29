// Toolbar popup (UC3 view warnings, UC4 quick settings).
import { applyI18n, t } from "../lib/i18n.js";
import { hostOf, isAllowlisted, normalizeDomain } from "../lib/policy.js";
import { getSettings, saveSettings } from "../lib/storage.js";

const LEVELS = ["LOW", "MEDIUM", "HIGH"];
const $ = (id) => document.getElementById(id);

let tab;
let lang = "vi";

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const s = await getSettings();
  lang = s.lang;
  applyI18n(document, lang);
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));

  $("enabled").checked = s.enabled;
  $("enabledText").textContent = t(lang, s.enabled ? "popup.on" : "popup.off");
  $("consentBanner").hidden = s.consented;
  setSensitivityUi(s.sensitivity);

  const host = hostOf(tab?.url || "");
  $("host").textContent = host;
  const allowed = isAllowlisted(host, s.allowlist);
  $("allowlistBtn").disabled = !host || allowed;
  $("allowlistBtn").textContent = t(lang, allowed ? "popup.siteAllowed" : "popup.allowSite");

  await renderItems(s, host, allowed);
  checkBackend();
}

function setSensitivityUi(level) {
  const i = Math.max(0, LEVELS.indexOf(level));
  const text = t(lang, `level.${LEVELS[i]}`);
  $("sensitivity").value = String(i);
  $("sensValue").textContent = text;
  $("sensitivity").setAttribute("aria-valuetext", text);
}

async function renderItems(s, host, allowed) {
  const list = $("items");
  list.replaceChildren();
  const status = (key, vars) => ($("status").textContent = t(lang, key, vars));
  if (!s.consented) return status("popup.statusConsent");
  if (!s.enabled) return status("popup.statusOff");
  if (!host) return status("popup.statusCantScan");
  if (allowed) return status("popup.statusAllowlisted");

  const state = tab ? await chrome.runtime.sendMessage({ type: "getTabState", tabId: tab.id }) : null;
  const items = (state?.items || []).slice().sort((a, b) => b.ts - a.ts);
  items.length ? status("popup.statusItems", { n: items.length }) : status("popup.statusClean");

  for (const item of items) {
    const v = item.verdict;
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "row between";
    const pill = document.createElement("span");
    pill.className = `label-pill label-${v.label}`;
    pill.textContent = t(lang, `label.${v.label}`);
    const conf = document.createElement("span");
    conf.className = "muted";
    conf.textContent = `${t(lang, item.kind === "image" ? "source.IMAGE" : "source.TEXT")} · ${Math.round((v.confidence || 0) * 100)}%`;
    head.append(pill, conf);

    const rationale = document.createElement("p");
    rationale.className = "rationale";
    rationale.textContent = v.rationale || "";

    const snippet = document.createElement("p");
    snippet.className = "snippet";
    snippet.textContent = item.snippet ? `“${item.snippet}”` : "";

    const actions = document.createElement("div");
    actions.className = "actions";
    const dismiss = document.createElement("button");
    dismiss.textContent = t(lang, "common.dismiss");
    dismiss.setAttribute("aria-label", t(lang, "popup.dismissAria", { label: pill.textContent }));
    dismiss.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "dismissItem", tabId: tab.id, itemId: item.id });
      li.remove();
    });
    actions.append(dismiss);

    li.append(head, rationale, snippet, actions);
    list.append(li);
  }
}

async function checkBackend() {
  const res = await chrome.runtime.sendMessage({ type: "health" });
  const el = $("backend");
  el.className = res?.ok ? "muted ok" : "muted bad";
  el.textContent = res?.ok ? t(lang, "popup.backendOk", { model: res.llm }) : t(lang, "popup.backendOff");
}

for (const b of document.querySelectorAll("[data-lang]")) {
  b.addEventListener("click", async () => {
    if (b.dataset.lang === lang) return;
    await saveSettings({ lang: b.dataset.lang });
    init();
  });
}

$("enabled").addEventListener("change", async (e) => {
  await saveSettings({ enabled: e.target.checked });
  init();
});

$("sensitivity").addEventListener("input", (e) => setSensitivityUi(LEVELS[Number(e.target.value)]));
$("sensitivity").addEventListener("change", (e) => saveSettings({ sensitivity: LEVELS[Number(e.target.value)] }));

$("allowlistBtn").addEventListener("click", async () => {
  const domain = normalizeDomain(hostOf(tab?.url || ""));
  if (!domain) return ($("allowlistErr").textContent = t(lang, "popup.cantAllow"));
  await chrome.runtime.sendMessage({ type: "allowlistDomain", domain, reason: "From popup" });
  init();
});

$("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("openConsent").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("consent/consent.html") }));

init();
