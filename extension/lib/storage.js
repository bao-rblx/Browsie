// chrome.storage.local wrappers: settings, allowlist, detection history (max 100).

export const DEFAULT_SETTINGS = {
  enabled: true,
  consented: false,            // set on the consent page (§2.6); nothing is scanned before this
  sensitivity: "MEDIUM",
  lang: "vi",                  // UI + rationale language: "vi" (default) or "en"
  ocrEnabled: true,
  allowlist: [],               // [{ domain, addedAt, reason }]
  backendUrl: "http://localhost:8000",
  apiToken: "",
};

export const HISTORY_MAX = 100;

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getHistory() {
  const { history } = await chrome.storage.local.get("history");
  return history || [];
}

export async function addHistory(entries) {
  if (!entries.length) return;
  const history = [...entries, ...(await getHistory())].slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ history });
}

/** Remove the given entry ids, or everything when ids is omitted. */
export async function clearHistory(ids) {
  if (!ids) return chrome.storage.local.set({ history: [] });
  const drop = new Set(ids);
  await chrome.storage.local.set({ history: (await getHistory()).filter((e) => !drop.has(e.id)) });
}
