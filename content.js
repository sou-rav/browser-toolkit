(() => {
  // Edge has its own Mini Menu, so this one stays off there (unless turned on in settings).
  const IS_EDGE = /\bEdg\//.test(navigator.userAgent);
  let edgeOverride = false;
  chrome.storage.local.get({ edgeOverride: false }, (r) => (edgeOverride = !!r.edgeOverride));
  chrome.storage.onChanged.addListener((c) => { if (c.edgeOverride) edgeOverride = !!c.edgeOverride.newValue; });
  let menuEnabled = true;
  chrome.storage.local.get({ menuEnabled: true }, (r) => (menuEnabled = r.menuEnabled !== false));
  chrome.storage.onChanged.addListener((c) => { if (c.menuEnabled) menuEnabled = c.menuEnabled.newValue !== false; });
  const blocked = () => !menuEnabled || (IS_EDGE && !edgeOverride);

  const host = location.hostname;
  let disabledSites = [];
  let menuHost = null;
  let anchorRect = null;
  const PAD = 40;

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
    if (menuHost) { menuHost.remove(); menuHost = null; }
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

  function showMenu(text, boundRect, endRect, startRect) {
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
        d.addEventListener("click", () => { item.run(); removeMenu(); });
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

    lastCtx = ctx;
    const mine = menuHost;
    // Stay invisible for a moment so the site's own popup (Reply, Ask ChatGPT...) can appear first,
    // then choose the spot once and fade in, instead of showing on top of it and jumping.
    menuHost.style.visibility = "hidden";
    menuHost.style.opacity = "0";
    place(startRect, boundRect, endRect, false);
    anchorRect = boundRect;
    setTimeout(() => {
      if (menuHost !== mine) return;
      place(startRect, boundRect, endRect, false);
      void mine.offsetHeight; // commit the final position first, so it never slides in from the covered spot
      mine.style.transition = "opacity .12s, top .15s, left .15s";
      mine.style.visibility = "visible";
      mine.style.opacity = "1";

      // A slower popup may still appear: react to the page changing (for 2 seconds) and glide out of its way.
      let raf = 0;
      const mo = new MutationObserver((list) => {
        if (menuHost !== mine) { mo.disconnect(); return; }
        if (list.every((m) => m.target === mine)) return;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (menuHost === mine) place(startRect, boundRect, endRect, true);
        });
      });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
      setTimeout(() => mo.disconnect(), 2000);
    }, SHOW_DELAY);
  }

  /* ---------- Smart placement: keep a gap from the site's own selection popups ---------- */
  const SHOW_DELAY = 200; // ms to wait for the site's own popup before showing ours
  const GAP = 12;     // space we want between our bar and another floating popup
  const MW = 36;      // bar width
  let lastCtx = null;

  // A "popup": a small floating element (tooltip, reply/ask bar, formatting toolbar) that isn't part of the selected text.
  function isPopup(el, selNode) {
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n === menuHost) return false;
      let cs;
      try { cs = getComputedStyle(n); } catch (_) { return false; }
      const pos = cs.position;
      if (pos !== "fixed" && pos !== "absolute" && pos !== "sticky") continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || r.width > 560 || r.height > 280) continue;
      if (selNode && n.contains(selNode)) continue;
      const role = n.getAttribute && n.getAttribute("role");
      const popupLike =
        pos === "fixed" || pos === "sticky" ||
        cs.zIndex !== "auto" ||
        /^(tooltip|dialog|menu|toolbar|listbox)$/.test(role || "") ||
        !!n.querySelector("button,[role=button],a[href],input");
      if (popupLike) return true;
    }
    return false;
  }

  // Look at the whole area (every ~8px, not just a few points) so a short popup can't slip between samples.
  function popupHits(rect, selNode) {
    const seen = new Set();
    let hits = 0;
    const step = 8;
    for (let x = rect.left; ; x += step) {
      const px = Math.min(x, rect.right);
      for (let y = rect.top; ; y += step) {
        const py = Math.min(y, rect.bottom);
        if (px >= 0 && py >= 0 && px < window.innerWidth && py < window.innerHeight) {
          for (const el of document.elementsFromPoint(px, py)) {
            if (seen.has(el)) continue;
            seen.add(el);
            if (isPopup(el, selNode) && ++hits >= 3) return hits;
          }
        }
        if (py >= rect.bottom) break;
      }
      if (px >= rect.right) break;
    }
    return hits;
  }

  /* ---------- Track elements that appear / change while you select ---------- */
  // Popups are usually created or revealed because of the selection. We note those elements and use their
  // on-screen position directly, so it doesn't matter how the site styled them (no z-index, pointer-events:none,
  // shadow DOM, a class toggle...).
  const recent = new Set();
  let watchObs = null, watchTimer = 0;
  function startWatch(ms) {
    if (!watchObs) {
      const note = (el) => { if (el !== menuHost && recent.size < 500) recent.add(el); };
      watchObs = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === "childList") m.addedNodes.forEach((n) => { if (n.nodeType === 1) note(n); });
          else if (m.target.nodeType === 1) note(m.target);
        }
      });
      watchObs.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ["style", "class", "hidden", "aria-hidden", "data-state", "open"]
      });
    }
    clearTimeout(watchTimer);
    watchTimer = setTimeout(stopWatch, ms);
  }
  function stopWatch() {
    if (watchObs) watchObs.disconnect();
    watchObs = null;
    recent.clear();
  }

  function obstacleRects(selNode) {
    const out = [];
    const consider = (n) => {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || r.width > 560 || r.height > 280) return;
      if (selNode && n.contains(selNode)) return;
      const cs = getComputedStyle(n);
      if (cs.position === "static" || cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.1) return;
      out.push(r);
    };
    recent.forEach((el) => {
      if (!el.isConnected) return;
      try {
        consider(el);
        let i = 0;
        for (const d of el.querySelectorAll("*")) { if (++i > 30) break; consider(d); }
      } catch (_) {}
    });
    return out;
  }

  const inflate = (r, p) => ({ left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p });
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  function place(startRect, boundRect, endRect, onlyIfBetter) {
    if (!menuHost) return;
    const sel = window.getSelection();
    let selNode = null;
    try { selNode = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null; } catch (_) {}
    if (selNode && selNode.nodeType === 3) selNode = selNode.parentElement;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const mh = menuHost.getBoundingClientRect().height || 112;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
    const text = [startRect, endRect, boundRect];

    // Where to try, in order: above the end (default), below the end, right of it, left of the start, above the start
    const spots = [
      { l: endRect.right, t: endRect.top - mh - 6 },
      { l: endRect.right, t: endRect.bottom + 6 },
      { l: endRect.right + GAP, t: endRect.top + endRect.height / 2 - mh / 2 },
      { l: startRect.left - MW - GAP, t: startRect.top + startRect.height / 2 - mh / 2 },
      { l: startRect.left, t: startRect.top - mh - 6 },
      { l: startRect.left, t: startRect.bottom + 6 }
    ];

    const obstacles = obstacleRects(selNode);
    const score = (l, t) => {
      const rect = { left: l, top: t, right: l + MW, bottom: t + mh };
      const padded = inflate(rect, GAP / 2 + 2);
      let n = popupHits(padded, selNode) + obstacles.filter((o) => intersects(padded, o)).length;
      if (text.some((r) => intersects(rect, r))) n += 100; // never sit on the selected text itself
      return n;
    };

    const here = menuHost.getBoundingClientRect();
    const currentScore = onlyIfBetter ? score(here.left, here.top) : Infinity;
    if (onlyIfBetter && currentScore === 0) return;

    let best = null;
    for (const s of spots) {
      const l = clamp(s.l, 4, vw - MW - 4), t = clamp(s.t, 4, vh - mh - 4);
      const n = score(l, t);
      if (!best || n < best.n) best = { l, t, n };
      if (n === 0) break;
    }
    if (onlyIfBetter && best.n >= currentScore) return;

    menuHost.style.left = best.l + window.scrollX + "px";
    menuHost.style.top = best.t + window.scrollY + "px";
    if (lastCtx) lastCtx.classList.toggle("left", best.l + MW + 6 + 260 > vw);
  }

  function onSelectionChange(e) {
    if (menuHost && e && e.composedPath && e.composedPath().includes(menuHost)) return;
    setTimeout(() => {
      if (blocked() || disabledSites.includes(host)) return removeMenu();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text) return removeMenu();
      let bound, end, start;
      try {
        const range = sel.getRangeAt(0);
        bound = range.getBoundingClientRect();
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
        end = rects.length ? rects[rects.length - 1] : bound;
        start = rects.length ? rects[0] : bound;
      } catch (_) {}
      if (!bound || (bound.width === 0 && bound.height === 0)) {
        const el = document.activeElement;
        if (el) bound = end = start = el.getBoundingClientRect();
      }
      if (bound && end) showMenu(text, bound, end, start || end);
    }, 10);
  }

  document.addEventListener("mousedown", (e) => {
    if (e.button === 0 && !(menuHost && e.composedPath().includes(menuHost))) startWatch(60000);
  }, true);
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    startWatch(4000);
    onSelectionChange(e);
  });
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
})();
