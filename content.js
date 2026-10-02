(() => {
  const host = location.hostname;
  let disabledSites = [];
  let menuHost = null;
  let anchorRect = null;
  const PAD = 40; // px of slack around selection + menu before it auto-hides

  chrome.storage.local.get({ disabledSites: [] }, (r) => (disabledSites = r.disabledSites));
  chrome.storage.onChanged.addListener((c) => {
    if (c.disabledSites) disabledSites = c.disabledSites.newValue || [];
  });

  const svg = (inner) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICONS = {
    more: svg('<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
  };

  function removeMenu() {
    if (menuHost) {
      menuHost.remove();
      menuHost = null;
    }
    anchorRect = null;
  }

  function copyText(text) {
    return navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    });
  }

  const open = (url) => window.open(url, "_blank");
  const q = encodeURIComponent;
  const short = (t) => (t.length > 20 ? t.slice(0, 20) + "…" : t);

  // Right-click style menu (opened by the 3-dot button)
  const contextItems = (text) => [
    { label: "Copy", key: "Ctrl+C", run: () => copyText(text) },
    { label: `Search Google for “${short(text)}”`, run: () => open(`https://www.google.com/search?q=${q(text)}`) },
    { label: "Translate to English", run: () => open(`https://translate.google.com/?sl=auto&tl=en&op=translate&text=${q(text)}`) },
    { label: "Define", run: () => open(`https://www.google.com/search?q=${q("define " + text)}`) },
    { label: "Read aloud", run: () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } },
    { sep: true },
    { label: "Select all", key: "Ctrl+A", run: () => document.execCommand("selectAll") },
    { label: "Print…", key: "Ctrl+P", run: () => setTimeout(() => window.print(), 50) },
    { sep: true },
    {
      label: "Hide on this site",
      run: () => {
        if (!disabledSites.includes(host)) {
          disabledSites = [...disabledSites, host];
          chrome.storage.local.set({ disabledSites });
        }
      }
    }
  ];

  function showMenu(text, boundRect, endRect) {
    removeMenu();
    menuHost = document.createElement("div");
    menuHost.style.cssText = "all:initial;position:absolute;z-index:2147483647;";
    const root = menuHost.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .wrap{position:relative}
        .bar{background:#2b2b2e;color:#e8e8ea;border-radius:14px;padding:6px;width:36px;
          display:flex;flex-direction:column;gap:2px;align-items:center;
          box-shadow:0 4px 16px rgba(0,0,0,.5);user-select:none}
        .btn{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;
          justify-content:center;cursor:pointer;color:inherit}
        .btn:hover{background:#414145}
        .ctx{display:none;position:absolute;top:0;left:calc(100% + 6px);background:#2c2c2c;color:#f2f2f2;
          border:1px solid #454545;border-radius:8px;padding:4px;min-width:250px;
          box-shadow:0 8px 24px rgba(0,0,0,.55);font:13px/1 "Segoe UI",system-ui,sans-serif;user-select:none}
        .ctx.left{left:auto;right:calc(100% + 6px)}
        .ctx.show{display:block}
        .ctx .it{display:flex;justify-content:space-between;gap:24px;padding:9px 12px;border-radius:5px;
          cursor:default;white-space:nowrap}
        .ctx .it:hover{background:#3d3d3d}
        .ctx .k{color:#9a9a9a}
        .ctx .sp{height:1px;background:#454545;margin:4px 6px}
      </style>
      <div class="wrap">
        <div class="bar">
          <div class="btn" data-a="more" title="More actions">${ICONS.more}</div>
          <div class="btn" data-a="copy" title="Copy">${ICONS.copy}</div>
          <div class="btn" data-a="search" title="Search Google">${ICONS.search}</div>
        </div>
        <div class="ctx"></div>
      </div>`;

    // Keep the text selected when clicking the menu
    menuHost.addEventListener("mousedown", (e) => e.preventDefault());

    const ctx = root.querySelector(".ctx");
    contextItems(text).forEach((item) => {
      const d = document.createElement("div");
      if (item.sep) {
        d.className = "sp";
      } else {
        d.className = "it";
        const l = document.createElement("span");
        l.textContent = item.label;
        d.appendChild(l);
        if (item.key) {
          const k = document.createElement("span");
          k.className = "k";
          k.textContent = item.key;
          d.appendChild(k);
        }
        d.addEventListener("click", () => {
          item.run();
          removeMenu();
        });
      }
      ctx.appendChild(d);
    });

    root.querySelectorAll(".btn").forEach((el) => {
      el.addEventListener("click", async () => {
        const a = el.dataset.a;
        if (a === "more") {
          ctx.classList.toggle("show");
        } else if (a === "copy") {
          await copyText(text);
          el.innerHTML = ICONS.check;
          setTimeout(removeMenu, 600);
        } else if (a === "search") {
          open(`https://www.google.com/search?q=${q(text)}`);
          removeMenu();
        }
      });
    });

    document.documentElement.appendChild(menuHost);

    // Place the bar where the selection ends (above that line, or below if no room)
    const mh = menuHost.getBoundingClientRect().height || 112;
    const mw = 36;
    const vw = document.documentElement.clientWidth;
    let topV = endRect.top - mh - 6;
    if (topV < 4) topV = endRect.bottom + 6;
    let leftV = Math.max(4, Math.min(endRect.right, vw - mw - 4));
    menuHost.style.top = topV + window.scrollY + "px";
    menuHost.style.left = leftV + window.scrollX + "px";

    // Open the right-click style menu to the left if there's no room on the right
    if (leftV + mw + 6 + 260 > vw) ctx.classList.add("left");

    anchorRect = boundRect;
  }

  function onSelectionChange(e) {
    if (menuHost && e && e.composedPath && e.composedPath().includes(menuHost)) return;
    setTimeout(() => {
      if (disabledSites.includes(host)) return removeMenu();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text) return removeMenu();
      let bound, end;
      try {
        const range = sel.getRangeAt(0);
        bound = range.getBoundingClientRect();
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
        end = rects.length ? rects[rects.length - 1] : bound;
      } catch (_) {}
      if (!bound || (bound.width === 0 && bound.height === 0)) {
        const el = document.activeElement;
        if (el) bound = end = el.getBoundingClientRect();
      }
      if (bound && end) showMenu(text, bound, end);
    }, 10);
  }

  // Left-click only: a right-click must not (re)show the menu
  document.addEventListener("mouseup", (e) => {
    if (e.button === 0) onSelectionChange(e);
  });
  // Hide the popup as soon as the browser's right-click menu opens
  document.addEventListener("contextmenu", (e) => {
    if (menuHost && e.composedPath().includes(menuHost)) return;
    removeMenu();
  }, true);
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") removeMenu();
    else if (e.shiftKey) onSelectionChange(e);
  });
  document.addEventListener("mousedown", (e) => {
    if (menuHost && !e.composedPath().includes(menuHost)) removeMenu();
  });

  // Auto-hide when the mouse moves away from the selection / menu
  document.addEventListener("mousemove", (e) => {
    if (!menuHost || !anchorRect) return;
    if (e.composedPath().includes(menuHost)) return;
    const m = menuHost.getBoundingClientRect();
    const left = Math.min(m.left, anchorRect.left) - PAD;
    const right = Math.max(m.right, anchorRect.right) + PAD;
    const top = Math.min(m.top, anchorRect.top) - PAD;
    const bottom = Math.max(m.bottom, anchorRect.bottom) + PAD;
    if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) removeMenu();
  }, { passive: true });
  window.addEventListener("scroll", removeMenu, { passive: true });

  // Double-click empty space -> Windows Snipping Tool
  const INTERACTIVE = 'a,button,input,textarea,select,option,label,video,audio,img,canvas,svg,iframe,[contenteditable="true"],[role="button"],[role="link"],[onclick]';
  document.addEventListener("dblclick", (e) => {
    if (e.button !== 0) return;
    if (menuHost && e.composedPath().includes(menuHost)) return;
    if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) return; // double-clicked a word, not empty space
      // Launch Snipping Tool from the current page (no new tab)
      const a = document.createElement("a");
      a.href = "ms-screenclip:";
      a.style.display = "none";
      document.documentElement.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
    }, 0);
  });
})();
