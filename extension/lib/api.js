// Backend client. Every failure throws so callers can apply BR-08 (UNKNOWN, never BENIGN).

const TIMEOUTS = { text: 6000, image: 15000, other: 4000 };

async function request(settings, path, { method = "GET", body, timeout = TIMEOUTS.other } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(settings.backendUrl.replace(/\/+$/, "") + path, {
      method,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiToken ? { "X-Browsie-Token": settings.apiToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const allowlistDomains = (s) => s.allowlist.map((e) => e.domain || e);

export const api = {
  health: (s) => request(s, "/health"),
  config: (s) => request(s, "/config"),
  analyzeText: (s, text, url) =>
    request(s, "/analyze-text", {
      method: "POST", timeout: TIMEOUTS.text,
      body: { text, url, sensitivity: s.sensitivity, allowlist: allowlistDomains(s), lang: s.lang },
    }),
  analyzeImage: (s, { imageBase64, mimeType, ocrText }, url) =>
    request(s, "/analyze-image", {
      method: "POST", timeout: TIMEOUTS.image,
      body: { imageBase64, mimeType, ocrText, url, sensitivity: s.sensitivity, allowlist: allowlistDomains(s), lang: s.lang },
    }),
};
