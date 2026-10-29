// First-run consent (§2.6). Nothing is scanned until the user accepts.
import { applyI18n, t } from "../lib/i18n.js";
import { getSettings, saveSettings } from "../lib/storage.js";

const $ = (id) => document.getElementById(id);
let lang = "vi";

async function render() {
  lang = (await getSettings()).lang;
  applyI18n(document, lang);
  document.title = t(lang, "consent.title");
  $("lang").value = lang;
}

$("lang").addEventListener("change", async (e) => {
  await saveSettings({ lang: e.target.value });
  render();
});

$("accept").addEventListener("click", async () => {
  await saveSettings({ consented: true, enabled: true });
  $("msg").textContent = t(lang, "consent.accepted");
  setTimeout(() => window.close(), 1200);
});

$("decline").addEventListener("click", async () => {
  await saveSettings({ consented: false });
  $("msg").textContent = t(lang, "consent.declined");
});

render();
