// Offscreen Document: hosts the Tesseract.js worker (F-03). Service workers can't spawn
// Web Workers, so OCR runs here. Library + WASM are bundled; VI/EN language data is
// downloaded from the Tesseract CDN on first use and cached by the browser.
/* global Tesseract */

let workerPromise = null;

function getWorker() {
  workerPromise ??= Tesseract.createWorker(["eng", "vie"], 1, {
    workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("vendor/tesseract/core/"),
    workerBlobURL: false,
  }).catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen" || msg.type !== "ocr") return false;
  (async () => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(msg.dataUrl);
      sendResponse({ text: data.text || "" });
    } catch (e) {
      sendResponse({ error: String(e?.message || e) });
    }
  })();
  return true;
});
