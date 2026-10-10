importScripts("rules.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};
const badge = (text, color) => {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch (_) {}
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === "snip") snip(msg);
  else if (msg.type === "shot") shot(msg);
  else if (msg.type === "open-recorder") openRecorder(msg.name);
});

/* ---------- Windows Snipping Tool (popup has closed, so it isn't captured) ---------- */
function snip(msg) {
  setTimeout(async () => {
    try {
      let id = msg.tabId;
      if (id == null) {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        id = t && t.id;
      }
      if (id != null) await chrome.tabs.update(id, { url: "ms-screenclip:" });
    } catch (_) {}
  }, 400);
}

/* ---------- Open the recorder from the in-meeting "Record this meeting?" prompt ---------- */
async function openRecorder(name) {
  const base = chrome.runtime.getURL("recorder.html");
  const tabs = await chrome.tabs.query({ url: base + "*" });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    chrome.runtime.sendMessage({ type: "auto-prompt", name });
  } else {
    chrome.tabs.create({ url: base + "?auto=1&name=" + encodeURIComponent(name || "") });
  }
}

/* ---------- Delayed screenshots ---------- */
async function shot({ mode, delay, tabId, windowId }) {
  let prevText = "";
  try { prevText = await chrome.action.getBadgeText({}); } catch (_) {}
  try {
    for (let i = delay; i > 0; i--) { badge(String(i), "#1a73e8"); await sleep(1000); }
    badge("…", "#1a73e8");
    if (mode === "visible") {
      const url = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      await chrome.downloads.download({ url, filename: `Screenshot ${stamp()}.png` });
    } else {
      await fullPage(tabId, windowId);
    }
    badge("OK", "#188038");
  } catch (e) {
    badge("ERR", "#d93025");
  }
  await sleep(1800);
  badge(prevText, "#d93025");
}

async function ensureOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!ctxs.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Stitch full-page screenshots and create the image file to download."
    });
  }
}

async function fullPage(tabId, windowId) {
  const run = (func, args = []) =>
    chrome.scripting.executeScript({ target: { tabId }, func, args }).then((r) => r[0].result);
  const info = await run(() => ({
    h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    vh: window.innerHeight, vw: window.innerWidth, y: window.scrollY, x: window.scrollX
  }));
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: "offscreen", type: "reset" });
  try {
    let total = info.h, y = 0, first = true;
    while (true) {
      const target = Math.min(y, Math.max(0, total - info.vh));
      const actual = await run((t) => { window.scrollTo(0, t); return window.scrollY; }, [target]);
      await sleep(600);
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      const r = await chrome.runtime.sendMessage({ target: "offscreen", type: "frame", dataUrl, y: actual, vw: info.vw, total });
      if (!r || !r.ok) throw new Error("stitch failed");
      total = Math.min(total, r.total);
      if (first) {
        first = false;
        await run(() => {
          document.querySelectorAll("*").forEach((el) => {
            const p = getComputedStyle(el).position;
            if (p === "fixed" || p === "sticky") {
              el.setAttribute("data-mmv", el.style.visibility || "-");
              el.style.visibility = "hidden";
            }
          });
        });
      }
      if (y + info.vh >= total) break;
      y += info.vh;
    }
    const f = await chrome.runtime.sendMessage({ target: "offscreen", type: "finish" });
    if (!f || !f.ok) throw new Error("finish failed");
    const id = await chrome.downloads.download({ url: f.url, filename: `Screenshot ${stamp()}.png` });
    const done = (d) => {
      if (d.id === id && d.state && (d.state.current === "complete" || d.state.current === "interrupted")) {
        chrome.downloads.onChanged.removeListener(done);
        chrome.runtime.sendMessage({ target: "offscreen", type: "reset" }).catch(() => {});
      }
    };
    chrome.downloads.onChanged.addListener(done);
  } finally {
    try {
      await run(() => {
        document.querySelectorAll("[data-mmv]").forEach((el) => {
          const v = el.getAttribute("data-mmv");
          el.style.visibility = v === "-" ? "" : v;
          el.removeAttribute("data-mmv");
        });
      });
      await run((x, y) => window.scrollTo(x, y), [info.x, info.y]);
    } catch (_) {}
  }
}

/* ---------- Download router: sort downloads into folders by file type ---------- */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["routingRules", "routerEnabled"], (r) => {
    const set = {};
    if (!r.routingRules) set.routingRules = DEFAULT_RULES;
    if (r.routerEnabled === undefined) set.routerEnabled = true;
    if (Object.keys(set).length) chrome.storage.sync.set(set);
  });
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.sync.get({ routerEnabled: true, routingRules: null }, (r) => {
    try {
      const name = item.filename || "";
      // leave it alone if routing is off, or another extension already chose a sub-folder
      if (!r.routerEnabled || /[\\/]/.test(name)) return suggest();
      const folder = matchFolder(r.routingRules || DEFAULT_RULES, name);
      if (folder) suggest({ filename: `${folder}/${name}` });
      else suggest();
    } catch (_) {
      suggest();
    }
  });
  return true; // suggest() is called asynchronously
});
