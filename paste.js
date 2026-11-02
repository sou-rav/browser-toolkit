// Paste menu: after you copy something in the browser, clicking into a text field offers a small "Paste" button.
// The copied text is kept in memory only (browser session storage), for 5 minutes, and is never sent anywhere.
(() => {
  "use strict";
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  if (!alive() || window.__btkPaste) return;
  window.__btkPaste = true;

  const host = location.hostname;
  const SKIP_HOSTS = /(^|\.)docs\.google\.com$/;       // Google Docs edits inside its own canvas/iframe
  let enabled = true, disabledSites = [];
  try {
    chrome.storage.local.get({ pasteEnabled: true, disabledSites: [] }, (r) => { enabled = r.pasteEnabled !== false; disabledSites = r.disabledSites || []; });
    chrome.storage.onChanged.addListener((c) => {
      if (c.pasteEnabled) enabled = c.pasteEnabled.newValue !== false;
      if (c.disabledSites) disabledSites = c.disabledSites.newValue || [];
      if (!enabled) hide();
    });
  } catch (_) {}
  const active = () => alive() && enabled && !disabledSites.includes(host) && !SKIP_HOSTS.test(host);

  const send = (m, cb) => {
    try { chrome.runtime.sendMessage(m, (r) => { void chrome.runtime.lastError; if (cb) cb(r); }); } catch (_) { if (cb) cb(null); }
  };

  /* ---------- remember what was copied ---------- */
  const isTextField = (a) => a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|search|email|url|tel|)$/i.test(a.type)));
  function selectedText() {
    const a = document.activeElement;
    if (isTextField(a)) { try { return a.value.slice(a.selectionStart, a.selectionEnd); } catch (_) { return ""; } }
    const s = window.getSelection();
    return s ? s.toString() : "";
  }
  const onCopy = () => {
    if (!active()) return;
    const a = document.activeElement;
    if (a && a.tagName === "INPUT" && a.type === "password") return;
    const t = selectedText();
    if (t && t.trim() && t.length <= 20000) send({ type: "clip-set", text: t });
  };
  document.addEventListener("copy", onCopy, true);
  document.addEventListener("cut", onCopy, true);

  /* ---------- which clicks count ---------- */
  function fieldFrom(e) {
    for (const n of e.composedPath()) {
      if (!n || n.nodeType !== 1) continue;
      if (n.tagName === "TEXTAREA" || n.tagName === "INPUT") return isTextField(n) && !n.readOnly && !n.disabled ? n : null;
      if (n.isContentEditable) {
        let h = n;
        while (h.parentElement && h.parentElement.isContentEditable) h = h.parentElement;
        return h;
      }
    }
    return null;
  }
  const BLANK = /[​-‍﻿\s]/g;
  function emptyOrAtEnd(f) {
    if (f.tagName === "TEXTAREA" || f.tagName === "INPUT") {
      const v = f.value || "";
      if (!v.trim()) return true;
      return f.selectionStart === f.selectionEnd && f.selectionEnd === v.length;
    }
    if (!(f.textContent || "").replace(BLANK, "")) return true;
    const s = window.getSelection();
    if (!s || !s.rangeCount || !s.isCollapsed || !f.contains(s.anchorNode)) return false;
    try {
      const tail = document.createRange();
      tail.selectNodeContents(f);
      tail.setStart(s.anchorNode, s.anchorOffset);
      return !tail.toString().replace(BLANK, "");
    } catch (_) { return false; }
  }

  /* ---------- the small button ---------- */
  let hostEl = null, hideTimer = 0;
  const offered = new WeakMap(); // field -> clip id already offered there
  function hide() {
    clearTimeout(hideTimer);
    if (hostEl) { hostEl.remove(); hostEl = null; }
  }
  function insert(f, text) {
    try { f.focus({ preventScroll: true }); } catch (_) {}
    // Rich editors (Discord, Slack, Claude, ChatGPT...) keep their own model of the text and ignore text the
    // browser slips into the page. They do handle a paste event, so offer them one first.
    if (f.isContentEditable) {
      try {
        const before = f.textContent;
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
        f.dispatchEvent(ev);
        if (ev.defaultPrevented || f.textContent !== before) return;   // the editor took it
      } catch (_) {}
    }
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (_) {}
    if (!ok && (f.tagName === "TEXTAREA" || f.tagName === "INPUT")) {
      const s = f.selectionStart == null ? f.value.length : f.selectionStart;
      const e = f.selectionEnd == null ? s : f.selectionEnd;
      f.setRangeText(text, s, e, "end");
      f.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }
  function show(x, y, field, clip) {
    hide();
    hostEl = document.createElement("div");
    hostEl.id = "btk-paste-host";
    hostEl.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:0;top:0";
    const root = hostEl.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .b{display:flex;align-items:center;gap:6px;padding:7px 12px 7px 10px;border-radius:10px;background:#2b2b2b;color:#fff;
           font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;user-select:none;
           box-shadow:0 4px 14px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);animation:i .12s ease-out}
        .b:hover{background:#3a3a3a}
        @keyframes i{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion:reduce){.b{animation:none}}
        svg{width:16px;height:16px}
      </style>
      <div class="b" role="button" aria-label="Paste copied text" title="Paste copied text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/></svg>
        <span>Paste</span>
      </div>`;
    const b = root.querySelector(".b");
    b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); }); // keep the cursor in the field
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); insert(field, clip.text); hide(); });
    document.documentElement.appendChild(hostEl);
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let l = Math.min(Math.max(4, x + 6), vw - r.width - 4);
    let t = y + 20;
    if (t + r.height > vh - 4) t = Math.max(4, y - r.height - 12);
    hostEl.style.left = l + "px";
    hostEl.style.top = t + "px";
    hideTimer = setTimeout(hide, 6000);
  }

  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || !active()) return;
    if (hostEl && e.composedPath().includes(hostEl)) return;
    const field = fieldFrom(e);
    const x = e.clientX, y = e.clientY;
    if (!field) return;
    setTimeout(() => {
      if (!alive() || !emptyOrAtEnd(field)) return;
      send({ type: "clip-get" }, (clip) => {
        if (!clip || !clip.text || offered.get(field) === clip.id) return;
        if (!field.isConnected || (field.tagName !== "TEXTAREA" && field.tagName !== "INPUT" && !field.isContentEditable)) return;
        offered.set(field, clip.id);
        show(x, y, field, clip);
      });
    }, 30);
  }, true);
  document.addEventListener("mousedown", (e) => { if (hostEl && !e.composedPath().includes(hostEl)) hide(); }, true);
  document.addEventListener("keydown", () => hide(), true);
  window.addEventListener("scroll", hide, { passive: true, capture: true });
})();
