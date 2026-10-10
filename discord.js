(() => {
  "use strict";
  if (window.__dsbLoaded) return;
  window.__dsbLoaded = true;

  const COMPOSER = '[class*="channelTextArea"]';          // Discord hashes class names but keeps these prefixes
  const EDITOR_Q = `${COMPOSER} [role="textbox"][contenteditable]`;
  const SEND_SVG =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

  const insts = new Map(); // editor element -> instance
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => el.isConnected && el.getClientRects().length > 0;

  /* ---------- draft helpers ---------- */
  const draftKey = (ed) => (ed.textContent || "") + "|" + ed.querySelectorAll("img,[data-slate-void='true']").length;
  function hasDraft(ed) {
    // Slate keeps a zero-width placeholder character in an empty editor
    if ((ed.textContent || "").replace(/[​-‍﻿ \s]/g, "")) return true;
    return !!ed.querySelector("img,[data-slate-void='true']"); // emoji-only drafts
  }
  function sendable(inst) {
    const ed = inst.editor;
    if (!ed.isConnected) return false;
    if (ed.getAttribute("contenteditable") === "false" || ed.getAttribute("aria-disabled") === "true") return false;
    if (hasDraft(ed)) return true;
    // an attachment alone can be sent with Enter; a no-op if there is nothing, so a loose check is safe
    return !!inst.composer.querySelector('[class*="channelAttachmentArea"] [class*="attachment"]');
  }

  /* ---------- sending: trigger Discord's own Enter handling ---------- */
  function keyEvent(type) {
    return new KeyboardEvent(type, {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, charCode: type === "keypress" ? 13 : 0,
      bubbles: true, cancelable: true, composed: true, view: window
    });
  }
  async function changed(ed, before, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await sleep(40);
      if (!ed.isConnected || draftKey(ed) !== before) return true; // Discord cleared the draft = it sent
    }
    return false;
  }
  async function send(inst) {
    if (inst.busy || !sendable(inst)) return;
    const ed = inst.editor;
    const hadFocus = inst.btn.matches(":focus");
    inst.busy = true;
    refresh(inst);
    const before = draftKey(ed);
    let ok = false;
    try {
      const nat = inst.composer.querySelector('button[aria-label="Send Message" i]:not(.dsb-btn)');
      if (nat) { nat.click(); ok = await changed(ed, before, 1000); }
      if (!ok) { ed.dispatchEvent(keyEvent("keydown")); ok = await changed(ed, before, 1000); }
      if (!ok) {                       // second, fuller key sequence; only if nothing happened at all
        ed.dispatchEvent(keyEvent("keydown"));
        ed.dispatchEvent(keyEvent("keypress"));
        ed.dispatchEvent(keyEvent("keyup"));
        ok = await changed(ed, before, 700);
      }
    } finally {
      inst.busy = false;
    }
    if (!ok) fail(inst);
    else if (hadFocus) { try { ed.focus({ preventScroll: true }); } catch (_) {} }
    refresh(inst);
  }
  function fail(inst) {
    inst.error = true;
    refresh(inst);
    clearTimeout(inst.errTimer);
    inst.errTimer = setTimeout(() => { inst.error = false; refresh(inst); }, 3500);
  }

  /* ---------- building / placing the button ---------- */
  function create(ed) {
    const composer = ed.closest(COMPOSER);
    if (!composer) return null;
    const wrap = document.createElement("div");
    wrap.className = "dsb-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dsb-btn";
    btn.innerHTML = SEND_SVG;
    wrap.appendChild(btn);
    const inst = { editor: ed, composer, wrap, btn, busy: false, error: false, mode: "", raf: 0, obs: null, ro: null };

    btn.addEventListener("mousedown", (e) => e.preventDefault());          // don't pull focus out of the draft
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); send(inst); });
    btn.addEventListener("keydown", (e) => e.stopPropagation());           // keep Discord hotkeys out of it

    // follow the draft (typing, clearing after send, emoji picker, paste...)
    inst.obs = new MutationObserver(() => queueRefresh(inst));
    inst.obs.observe(ed, { childList: true, subtree: true, characterData: true });
    // follow layout changes of the message box
    if (typeof ResizeObserver === "function") {
      inst.ro = new ResizeObserver(() => queueRefresh(inst, true));
      inst.ro.observe(composer);
    }
    insts.set(ed, inst);
    return inst;
  }
  function destroy(inst) {
    clearTimeout(inst.errTimer);
    cancelAnimationFrame(inst.raf);
    if (inst.obs) inst.obs.disconnect();
    if (inst.ro) inst.ro.disconnect();
    inst.wrap.remove();
    insts.delete(inst.editor);
  }

  // The group of native icons (gift, GIF, sticker, emoji, apps) on the right of the box.
  function findRow(composer, editor) {
    const er = editor.getBoundingClientRect();
    let best = null;
    for (const el of composer.querySelectorAll('[class*="buttons"]')) {
      if (el.contains(editor) || el.closest(".dsb-wrap")) continue;
      if (el.querySelectorAll('button,[role="button"]').length < 2) continue;
      const rr = el.getBoundingClientRect();
      if (rr.left <= er.left || rr.bottom < er.top || rr.top > er.bottom) continue;
      best = el;                                                            // the last match is the rightmost group
    }
    return best;
  }

  function place(inst) {
    const { wrap, composer, editor } = inst;
    const row = findRow(composer, editor);
    if (row) {
      wrap.classList.remove("dsb-overlay");
      if (wrap.parentElement !== row || row.firstElementChild !== wrap) row.insertBefore(wrap, row.firstChild);
      inst.mode = "row";
    } else {
      // fallback: a small overlay, positioned from the box's current size, just left of the native icons
      if (!wrap.classList.contains("dsb-overlay") || wrap.parentElement !== document.body) {
        wrap.classList.add("dsb-overlay");
        document.body.appendChild(wrap);
      }
      inst.mode = "overlay";
    }
  }

  function positionOverlay(inst) {
    const cr = inst.composer.getBoundingClientRect();
    const w = inst.wrap.offsetWidth || 32, h = inst.wrap.offsetHeight || 32;
    const nat = [...inst.composer.querySelectorAll('button,[role="button"]')]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left > cr.left + cr.width * 0.6);
    const edge = nat.length ? Math.min(...nat.map((r) => r.left)) : cr.right - 8;
    const mid = nat.length ? (nat[0].top + nat[0].bottom) / 2 : (cr.top + cr.bottom) / 2;
    inst.wrap.style.transform = `translate(${Math.round(edge - w - 4)}px, ${Math.round(mid - h / 2)}px)`;
  }

  function refresh(inst) {
    const { wrap, btn, composer, editor } = inst;
    const ok = sendable(inst);
    const label = inst.error ? "Couldn't send. Press Enter instead." : "Send message";
    btn.setAttribute("aria-label", label);
    btn.title = inst.error ? label : ok ? "Send message" : "Send message (type something first)";
    btn.setAttribute("aria-disabled", String(!ok || inst.busy));
    btn.dataset.busy = String(inst.busy);
    btn.dataset.error = String(inst.error);
    wrap.classList.toggle("dsb-ready", ok && !inst.busy && !inst.error);

    // copy size / colour from a neighbouring native icon so every theme matches
    let sib = null;
    if (inst.mode === "row") sib = [...wrap.parentElement.children].find((c) => c !== wrap);
    else sib = [...composer.querySelectorAll('button,[role="button"]')].find((b) => !wrap.contains(b) && b.offsetWidth);
    if (sib) {
      const r = sib.getBoundingClientRect();
      if (r.width >= 20 && r.width <= 56) wrap.style.setProperty("--dsb-w", Math.round(r.width) + "px");
      if (r.height >= 20 && r.height <= 56) wrap.style.setProperty("--dsb-h", Math.round(r.height) + "px");
      const icon = sib.querySelector("svg") || sib;
      const color = getComputedStyle(icon).color;
      if (color) wrap.style.setProperty("--dsb-icon", color);
      if (inst.mode === "row") {
        const cs = getComputedStyle(sib);
        wrap.style.alignSelf = cs.alignSelf;
        wrap.style.marginTop = cs.marginTop;
        wrap.style.marginBottom = cs.marginBottom;
      }
    }
    if (inst.mode === "overlay") positionOverlay(inst);
  }

  function queueRefresh(inst, relayout) {
    if (inst.raf) return;
    inst.raf = requestAnimationFrame(() => {
      inst.raf = 0;
      if (!inst.editor.isConnected) return;
      if (relayout) place(inst);
      refresh(inst);
    });
  }

  /* ---------- keep everything in sync with Discord's single-page app ---------- */
  let enabled = true;
  function ensure() {
    if (!enabled) { [...insts.values()].forEach(destroy); document.querySelectorAll(".dsb-wrap").forEach((w) => w.remove()); return; }
    const eds = new Set([...document.querySelectorAll(EDITOR_Q)].filter((e) => visible(e) && !e.closest('[id^="chat-messages-"]') && e.getAttribute("contenteditable") !== "false"));
    for (const inst of [...insts.values()]) if (!eds.has(inst.editor)) destroy(inst);
    eds.forEach((ed) => {
      const inst = insts.get(ed) || create(ed);
      if (!inst) return;
      place(inst);
      refresh(inst);
    });
    // never leave duplicates or orphans behind
    const own = new Set([...insts.values()].map((i) => i.wrap));
    document.querySelectorAll(".dsb-wrap").forEach((w) => { if (!own.has(w)) w.remove(); });
  }

  let timer = 0, last = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; last = Date.now(); ensure(); }, Math.max(0, 200 - (Date.now() - last)));
  }

  const isOwn = (m) => {
    if (m.addedNodes.length + m.removedNodes.length === 1) {
      const n = m.addedNodes[0] || m.removedNodes[0];
      if (n.nodeType === 1 && n.classList && n.classList.contains("dsb-wrap")) return true;
    }
    return !!(m.target.closest && m.target.closest(".dsb-wrap"));
  };
  new MutationObserver((list) => { if (!list.every(isOwn)) schedule(); })
    .observe(document.body, { childList: true, subtree: true });
  // theme switches change <html> attributes
  new MutationObserver(() => schedule())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  window.addEventListener("resize", () => insts.forEach((i) => queueRefresh(i, true)), { passive: true });

  try {
    chrome.storage.local.get({ discordSend: true }, (r) => { enabled = r.discordSend !== false; schedule(); setTimeout(schedule, 1500); });
    chrome.storage.onChanged.addListener((c) => { if (c.discordSend) { enabled = c.discordSend.newValue !== false; schedule(); } });
  } catch (_) { schedule(); }
})();
