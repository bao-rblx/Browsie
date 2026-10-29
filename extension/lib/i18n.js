// UI strings: Vietnamese (default) and English.
// Used by popup/options/consent (ES module import), background (import) and the content
// script (dynamic import via web_accessible_resources).

export const LANGS = ["vi", "en"];
export const DEFAULT_LANG = "vi";
export const LANG_NAMES = { vi: "Tiếng Việt", en: "English" };

export const STRINGS = {
  vi: {
    // labels / sources / levels
    "label.SPAM": "Nội dung rác",
    "label.FAKE_NEWS": "Có thể là tin giả",
    "label.GAMBLING_AD": "Quảng cáo cờ bạc",
    "label.UNKNOWN": "Chưa xác minh được",
    "label.BENIGN": "Không có vấn đề",
    "source.TEXT": "Văn bản",
    "source.IMAGE": "Hình ảnh",
    "level.LOW": "Thấp",
    "level.MEDIUM": "Trung bình",
    "level.HIGH": "Cao",
    "common.dismiss": "Bỏ qua",
    "common.language": "Ngôn ngữ",

    // popup
    "popup.on": "Bật",
    "popup.off": "Tắt",
    "popup.consentPaused": "Browsie đang tạm dừng cho đến khi bạn xem thông báo quyền riêng tư.",
    "popup.reviewEnable": "Xem và bật",
    "popup.sensitivity": "Độ nhạy",
    "popup.sensHint": "Độ nhạy càng cao, càng nhiều đoạn văn đáng ngờ được gửi cho AI kiểm tra.",
    "popup.thisPage": "Trang này",
    "popup.statusConsent": "Chưa quét — cần bạn đồng ý.",
    "popup.statusOff": "Browsie đang tắt.",
    "popup.statusCantScan": "Không thể quét trang này.",
    "popup.statusAllowlisted": "Trang tin cậy — không quét.",
    "popup.statusItems": "{n} mục cần chú ý.",
    "popup.statusClean": "Không phát hiện vấn đề trên trang này.",
    "popup.dismissAria": "Bỏ qua cảnh báo {label}",
    "popup.allowSite": "Luôn tin cậy trang này",
    "popup.siteAllowed": "Trang đã được tin cậy",
    "popup.cantAllow": "Không thể thêm địa chỉ trang này vào danh sách tin cậy.",
    "popup.checkingBackend": "Đang kiểm tra máy chủ…",
    "popup.backendOk": "Máy chủ OK · {model}",
    "popup.backendOff": "Máy chủ ngoại tuyến — không kiểm tra AI được",
    "popup.openOptions": "Lịch sử & cài đặt",

    // options
    "opt.pageTitle": "Browsie — Cài đặt & lịch sử",
    "opt.heading": "Cài đặt Browsie",
    "opt.general": "Chung",
    "opt.enable": "Bật quét nội dung",
    "opt.ocr": "Chạy OCR trên ảnh tôi phân tích",
    "opt.sensitivity": "Độ nhạy",
    "opt.levelLow": "Thấp (ít cảnh báo hơn)",
    "opt.levelMedium": "Trung bình",
    "opt.levelHigh": "Cao (nhiều cảnh báo hơn)",
    "opt.language": "Ngôn ngữ giao diện",
    "opt.allowlist": "Danh sách tin cậy",
    "opt.allowlistHint": "Các trang thuộc những tên miền này (và tên miền con) sẽ không bao giờ bị phân tích.",
    "opt.domainLabel": "Tên miền cần tin cậy",
    "opt.add": "Thêm",
    "opt.invalidDomain": "Hãy nhập tên miền hợp lệ, ví dụ: example.com",
    "opt.noAllowlist": "Chưa có tên miền nào.",
    "opt.remove": "Xóa",
    "opt.removeAria": "Xóa {domain} khỏi danh sách tin cậy",
    "opt.history": "Lịch sử phát hiện",
    "opt.clearSelected": "Xóa mục đã chọn",
    "opt.clearAll": "Xóa tất cả",
    "opt.selectAll": "Chọn tất cả",
    "opt.colTime": "Thời gian",
    "opt.colSource": "Nguồn",
    "opt.colLabel": "Nhãn",
    "opt.colConf": "Độ tin cậy",
    "opt.colSite": "Trang / lý do",
    "opt.selectEntry": "Chọn mục lúc {time}",
    "opt.histEmpty": "Chưa có phát hiện nào. Hãy duyệt web bình thường, hoặc nhấp chuột phải vào một ảnh và chọn “Phân tích bằng AI Filter”.",
    "opt.confirmClear": "Xóa toàn bộ lịch sử phát hiện?",
    "opt.backend": "Máy chủ",
    "opt.url": "URL",
    "opt.token": "Mã API",
    "opt.save": "Lưu",
    "opt.test": "Kiểm tra kết nối",
    "opt.reloadRules": "Tải lại luật",
    "opt.invalidUrl": "Hãy nhập URL http(s) hợp lệ.",
    "opt.saved": "Đã lưu.",
    "opt.testing": "Đang kiểm tra…",
    "opt.connected": "Đã kết nối · mô hình {model} · luật v{version}",
    "opt.failed": "Thất bại: {error}",
    "opt.rulesLoaded": "Đã tải {count} luật (v{version}).",

    // consent (html keys contain only static markup from this file)
    "consent.title": "Chào mừng đến với Browsie",
    "consent.intro": "Browsie cảnh báo bạn về spam, tin giả và quảng cáo cờ bạc ẩn trong trang web và hình ảnh. Trước khi bắt đầu, đây là chính xác những gì Browsie làm với dữ liệu của bạn:",
    "consent.p1": "<strong>Văn bản trên trang được kiểm tra ngay trên máy bạn trước</strong> bằng bộ lọc luật cục bộ.",
    "consent.p2": "<strong>Chỉ những đoạn bị bộ lọc đánh dấu đáng ngờ</strong> mới được gửi lên máy chủ Browsie để hỏi thêm ý kiến từ Google Gemini.",
    "consent.p3": "<strong>Hình ảnh chỉ được gửi khi bạn nhấp chuột phải</strong> và chọn “Phân tích bằng AI Filter”. Chữ trong ảnh được đọc bằng OCR ngay trên máy bạn trước.",
    "consent.p4": "<strong>Không tải lên ngầm hàng loạt</strong> những gì bạn duyệt. Cài đặt và lịch sử nằm trong trình duyệt của bạn; máy chủ chỉ giữ nhật ký ẩn danh (mã băm tên miền, nhãn và thời gian).",
    "consent.p5": "Cảnh báo chỉ mang tính gợi ý. Bạn có thể bỏ qua, thêm trang vào danh sách tin cậy, hoặc tắt Browsie bất cứ lúc nào từ thanh công cụ.",
    "consent.accept": "Tôi đồng ý — bật Browsie",
    "consent.decline": "Để sau",
    "consent.accepted": "Browsie đã bật. Bạn có thể đóng thẻ này.",
    "consent.declined": "Chưa bật quét. Mở cửa sổ Browsie bất cứ lúc nào để bật.",

    // content script
    "cs.chipAria": "Cảnh báo Browsie: {label}. Xem chi tiết",
    "cs.dialogAria": "Chi tiết phát hiện của Browsie",
    "cs.trust": "Tin cậy {host}",
    "cs.analyzing": "Đang phân tích hình ảnh…",
    "cs.analyzingToast": "Browsie đang phân tích hình ảnh…",
    "cs.noIssues": "✓ Không phát hiện vấn đề ({pct})",
    "cs.detected": "⚠ Phát hiện {label} ({pct})",
    "cs.showImage": "Hiện ảnh",

    // background / verdict rationales produced in the browser
    "menu.analyze": "Phân tích bằng AI Filter",
    "bg.off": "Browsie đang tắt — hãy bật lại từ cửa sổ trên thanh công cụ.",
    "bg.allowlisted": "{host} nằm trong danh sách tin cậy — không phân tích.",
    "why.noSuspicious": "Không tìm thấy dấu hiệu đáng ngờ",
    "why.unavailable": "Dịch vụ không khả dụng — nhấn để thử lại",
    "why.gamblingText": "Phát hiện từ khóa cờ bạc trong văn bản trang",
    "why.gamblingImage": "Phát hiện từ khóa cờ bạc trong chữ trên ảnh",
    "why.cantRead": "Không đọc được ảnh này — {error}",
  },

  en: {
    "label.SPAM": "Spam",
    "label.FAKE_NEWS": "Possible fake news",
    "label.GAMBLING_AD": "Gambling ad",
    "label.UNKNOWN": "Could not verify",
    "label.BENIGN": "No issues",
    "source.TEXT": "Text",
    "source.IMAGE": "Image",
    "level.LOW": "Low",
    "level.MEDIUM": "Medium",
    "level.HIGH": "High",
    "common.dismiss": "Dismiss",
    "common.language": "Language",

    "popup.on": "On",
    "popup.off": "Off",
    "popup.consentPaused": "Scanning is paused until you review the privacy notice.",
    "popup.reviewEnable": "Review & enable",
    "popup.sensitivity": "Sensitivity",
    "popup.sensHint": "Higher sensitivity sends more borderline text for AI review.",
    "popup.thisPage": "This page",
    "popup.statusConsent": "Not scanning — consent required.",
    "popup.statusOff": "Browsie is off.",
    "popup.statusCantScan": "This page can't be scanned.",
    "popup.statusAllowlisted": "Allowlisted — not scanned.",
    "popup.statusItems": "{n} item(s) need attention.",
    "popup.statusClean": "No issues found on this page.",
    "popup.dismissAria": "Dismiss {label} warning",
    "popup.allowSite": "Always allow this site",
    "popup.siteAllowed": "Site is allowlisted",
    "popup.cantAllow": "This site's address can't be allowlisted.",
    "popup.checkingBackend": "Checking backend…",
    "popup.backendOk": "Backend OK · {model}",
    "popup.backendOff": "Backend offline — AI checks unavailable",
    "popup.openOptions": "History & settings",

    "opt.pageTitle": "Browsie — Settings & History",
    "opt.heading": "Browsie settings",
    "opt.general": "General",
    "opt.enable": "Enable scanning",
    "opt.ocr": "Run OCR on images I analyse",
    "opt.sensitivity": "Sensitivity",
    "opt.levelLow": "Low (fewer warnings)",
    "opt.levelMedium": "Medium",
    "opt.levelHigh": "High (more warnings)",
    "opt.language": "Interface language",
    "opt.allowlist": "Allowlist",
    "opt.allowlistHint": "Pages on these domains (and their subdomains) are never analysed.",
    "opt.domainLabel": "Domain to allow",
    "opt.add": "Add",
    "opt.invalidDomain": "Enter a valid domain, e.g. example.com",
    "opt.noAllowlist": "No allowlisted domains.",
    "opt.remove": "Remove",
    "opt.removeAria": "Remove {domain} from allowlist",
    "opt.history": "Detection history",
    "opt.clearSelected": "Clear selected",
    "opt.clearAll": "Clear all",
    "opt.selectAll": "Select all",
    "opt.colTime": "Time",
    "opt.colSource": "Source",
    "opt.colLabel": "Label",
    "opt.colConf": "Confidence",
    "opt.colSite": "Site / rationale",
    "opt.selectEntry": "Select entry from {time}",
    "opt.histEmpty": "No detections yet. Browse normally, or right-click an image and choose “Analyze with AI Filter”.",
    "opt.confirmClear": "Clear all detection history?",
    "opt.backend": "Backend",
    "opt.url": "URL",
    "opt.token": "API token",
    "opt.save": "Save",
    "opt.test": "Test connection",
    "opt.reloadRules": "Reload rules",
    "opt.invalidUrl": "Enter a valid http(s) URL.",
    "opt.saved": "Saved.",
    "opt.testing": "Testing…",
    "opt.connected": "Connected · model {model} · rules v{version}",
    "opt.failed": "Failed: {error}",
    "opt.rulesLoaded": "Loaded {count} rules (v{version}).",

    "consent.title": "Welcome to Browsie",
    "consent.intro": "Browsie warns you about spam, fake news and gambling ads hidden in pages and images. Before it starts, here is exactly what it does with your data:",
    "consent.p1": "<strong>Page text is checked on your device first</strong> by a local rule filter.",
    "consent.p2": "<strong>Only text the filter flags as suspicious</strong> is sent to the Browsie server, which asks Google Gemini for a second opinion.",
    "consent.p3": "<strong>Images are only sent when you right-click them</strong> and choose “Analyze with AI Filter”. Their text is read on your device with OCR first.",
    "consent.p4": "There is <strong>no silent bulk upload</strong> of what you browse. Settings and history stay in your browser; the server keeps only anonymous logs (a hash of the domain, the label and timing).",
    "consent.p5": "Warnings are advice. You can dismiss them, allowlist a site, or turn Browsie off at any time from the toolbar.",
    "consent.accept": "I agree — enable Browsie",
    "consent.decline": "Not now",
    "consent.accepted": "Browsie is on. You can close this tab.",
    "consent.declined": "Scanning stays off. Open the Browsie popup any time to enable it.",

    "cs.chipAria": "Browsie warning: {label}. Show details",
    "cs.dialogAria": "Browsie detection details",
    "cs.trust": "Trust {host}",
    "cs.analyzing": "Analysing image…",
    "cs.analyzingToast": "Browsie is analysing the image…",
    "cs.noIssues": "✓ No issues detected ({pct})",
    "cs.detected": "⚠ {label} detected ({pct})",
    "cs.showImage": "Show image",

    "menu.analyze": "Analyze with AI Filter",
    "bg.off": "Browsie is turned off — enable it from the toolbar popup.",
    "bg.allowlisted": "{host} is on your allowlist — not analysed.",
    "why.noSuspicious": "No suspicious patterns found",
    "why.unavailable": "Service unavailable — tap to retry",
    "why.gamblingText": "Gambling keywords detected in page text",
    "why.gamblingImage": "Gambling keywords detected in image text",
    "why.cantRead": "Could not read this image — {error}",
  },
};

export function resolveLang(lang) {
  return LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

/** Translate `key` into `lang`, filling {placeholders} from `vars`. Falls back to English, then the key. */
export function t(lang, key, vars = {}) {
  const s = STRINGS[resolveLang(lang)][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Fill a page from data-i18n* attributes. data-i18n-html is only used for static strings in this file. */
export function applyI18n(doc, lang) {
  lang = resolveLang(lang);
  doc.documentElement.lang = lang;
  for (const el of doc.querySelectorAll("[data-i18n]")) el.textContent = t(lang, el.dataset.i18n);
  for (const el of doc.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(lang, el.dataset.i18nHtml);
  for (const el of doc.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(lang, el.dataset.i18nPlaceholder);
  for (const el of doc.querySelectorAll("[data-i18n-aria-label]")) el.setAttribute("aria-label", t(lang, el.dataset.i18nAriaLabel));
}

/** Locale for dates/numbers. */
export const locale = (lang) => (resolveLang(lang) === "vi" ? "vi-VN" : "en-US");
