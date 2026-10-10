const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

/* ---------- toast ---------- */
let toastTimer;
function setStatus(t, sticky) {
  const el = $("toast");
  el.textContent = t || "";
  el.classList.toggle("show", !!t);
  clearTimeout(toastTimer);
  if (t && !sticky) toastTimer = setTimeout(() => el.classList.remove("show"), 4500);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function fmt(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (h ? pad(h) + ":" : "") + pad(m) + ":" + pad(s % 60);
}
function send(msg) {
  return new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r); }); }
    catch (_) { res(undefined); }
  });
}
async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

/* ---------- Edge: it has its own selection menu and web capture, so those tools are hidden ---------- */
const IS_EDGE = /\bEdg\//.test(navigator.userAgent);
chrome.storage.local.get({ edgeOverride: false }, ({ edgeOverride }) => {
  if (IS_EDGE && !edgeOverride) document.body.classList.add("edge");
});

chrome.storage.local.get({ recEnabled: true, shotsEnabled: true, menuEnabled: true }, (r) => {
  document.body.classList.toggle("no-rec", r.recEnabled === false);
  document.body.classList.toggle("no-shot", r.shotsEnabled === false);
  document.body.classList.toggle("no-menu", r.menuEnabled === false);
});
chrome.storage.sync.get({ routerEnabled: true }, (r) => document.body.classList.toggle("no-dl", r.routerEnabled === false));
chrome.storage.onChanged.addListener((c) => {
  if (c.recEnabled) document.body.classList.toggle("no-rec", c.recEnabled.newValue === false);
  if (c.shotsEnabled) document.body.classList.toggle("no-shot", c.shotsEnabled.newValue === false);
  if (c.menuEnabled) document.body.classList.toggle("no-menu", c.menuEnabled.newValue === false);
  if (c.routerEnabled) document.body.classList.toggle("no-dl", c.routerEnabled.newValue === false);
});

$("settings").onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };

/* ---------- Per-site toggle for the selection menu ---------- */
(async () => {
  const tab = await activeTab();
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (_) {}
  $("site").textContent = host || "this page";
  const box = $("on");
  if (!host) { box.disabled = true; return; }
  chrome.storage.local.get({ disabledSites: [] }, ({ disabledSites }) => {
    box.checked = !disabledSites.includes(host);
    box.onchange = () => {
      const list = disabledSites.filter((h) => h !== host);
      if (!box.checked) list.push(host);
      disabledSites = list;
      chrome.storage.local.set({ disabledSites: list });
    };
  });
})();

/* ---------- Screen recording controls ---------- */
async function refreshRec() {
  const r = await send({ type: "rec-status" });
  const active = !!(r && (r.status === "recording" || r.status === "paused" || r.status === "countdown"));
  const live = !!(r && (r.status === "recording" || r.status === "paused"));
  $("rec").classList.toggle("active", active);
  $("recTitle").textContent = active ? "Open recorder" : "Record screen";
  $("recSub").textContent = active ? "Go to the recording tab" : "MP4 · tab, window or screen";
  $("recLive").classList.toggle("hide", !live);
  if (r) {
    $("recLive").classList.toggle("paused", r.status === "paused");
    $("recTime").textContent = fmt(r.elapsed || 0);
    $("recState").textContent = r.status === "paused" ? "Paused" : "Recording";
    $("recPause").querySelector("span").textContent = r.status === "paused" ? "Resume" : "Pause";
  }
}
async function openRecorder() {
  const url = chrome.runtime.getURL("recorder.html");
  try {
    const ctxs = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
    const c = ctxs.find((x) => x.documentUrl && x.documentUrl.startsWith(url));
    if (c) {
      await chrome.tabs.update(c.tabId, { active: true });
      await chrome.windows.update(c.windowId, { focused: true });
      window.close();
      return;
    }
  } catch (_) {}
  chrome.tabs.create({ url });
  window.close();
}
$("rec").onclick = openRecorder;
$("recPause").onclick = async () => {
  const resume = $("recPause").querySelector("span").textContent === "Resume";
  await send({ type: "rec-cmd", cmd: resume ? "resume" : "pause" });
  refreshRec();
};
$("recStop").onclick = async () => {
  await send({ type: "rec-cmd", cmd: "stop" });
  setStatus("Recording stopped and saved.");
  refreshRec();
};
refreshRec();
setInterval(refreshRec, 1000);

/* ---------- Screenshot delay ---------- */
function markDelay(v) {
  $("shotDelay").value = v;
  document.querySelectorAll("#delaySeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === String(v)));
}
chrome.storage.local.get({ shotDelay: "0" }, ({ shotDelay }) => markDelay(shotDelay));
document.querySelectorAll("#delaySeg button").forEach((b) => {
  b.onclick = () => { markDelay(b.dataset.v); chrome.storage.local.set({ shotDelay: b.dataset.v }); };
});
// With a delay, the background script takes the shot so you can click around the page first.
async function delayedShot(mode) {
  const delay = +$("shotDelay").value;
  if (!delay) return false;
  const tab = await activeTab();
  chrome.runtime.sendMessage({ type: "shot", mode, delay, tabId: tab.id, windowId: tab.windowId });
  window.close();
  return true;
}

/* ---------- Screenshots ---------- */
async function saveAndCopy(canvasOrBlob, label) {
  const blob = canvasOrBlob instanceof Blob ? canvasOrBlob : await new Promise((r) => canvasOrBlob.toBlob(r, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Screenshot ${stamp()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  let copied = false;
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); copied = true; } catch (_) {}
  setStatus(`${label} saved${copied ? " and copied to the clipboard" : ""}.`);
}

$("shotVisible").onclick = async () => {
  if (await delayedShot("visible")) return;
  try {
    const tab = await activeTab();
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const blob = await (await fetch(dataUrl)).blob();
    await saveAndCopy(blob, "Screenshot");
  } catch (e) {
    setStatus("Can't capture this page (browser pages and the Web Store are blocked).");
  }
};

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

$("shotFull").onclick = async () => {
  if (await delayedShot("full")) return;
  const btns = ["shotVisible", "shotFull", "snip"].map($);
  btns.forEach((b) => (b.disabled = true));
  const tab = await activeTab();
  const run = (func, args = []) => chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args }).then((r) => r[0].result);
  let info;
  try {
    info = await run(() => ({
      h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
      vh: window.innerHeight, vw: window.innerWidth, y: window.scrollY, x: window.scrollX
    }));
  } catch (e) {
    setStatus("Can't capture this page (browser pages and the Web Store are blocked).");
    btns.forEach((b) => (b.disabled = false));
    return;
  }
  try {
    let canvas = null, scale = 1;
    let total = info.h;
    let y = 0, n = 0;
    const frames = Math.ceil(total / info.vh);
    while (true) {
      const target = Math.min(y, Math.max(0, total - info.vh));
      const actual = await run((t) => { window.scrollTo(0, t); return window.scrollY; }, [target]);
      await sleep(600);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      const img = await loadImage(dataUrl);
      if (!canvas) {
        scale = img.width / info.vw;
        const maxCss = Math.floor(30000 / scale);
        if (total > maxCss) total = maxCss;
        canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = Math.round(total * scale);
      }
      canvas.getContext("2d").drawImage(img, 0, Math.round(actual * scale));
      n++;
      setStatus(`Capturing full page… ${n}/${frames} (keep this popup open)`, true);
      if (y === 0) {
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
    await saveAndCopy(canvas, "Full-page screenshot");
  } catch (e) {
    setStatus("Full-page capture failed. Try the visible-area screenshot.");
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
    btns.forEach((b) => (b.disabled = false));
  }
};

/* ---------- Windows Snipping Tool ---------- */
// The popup closes first (so it isn't in the screenshot); the background script
// then launches Snipping Tool, and Chrome's permission prompt shows in the page.
$("snip").onclick = async () => {
  const tab = await activeTab();
  chrome.runtime.sendMessage({ type: "snip", tabId: tab && tab.id });
  window.close();
};

/* ---------- Download router ---------- */
function routerSummary(rules) {
  const folders = Object.keys(rules || {}).length;
  const types = Object.values(rules || {}).reduce((n, a) => n + (a ? a.length : 0), 0);
  return `${folders} folder${folders === 1 ? "" : "s"} · ${types} file type${types === 1 ? "" : "s"}`;
}
chrome.storage.sync.get({ routerEnabled: true, routingRules: null }, (r) => {
  $("routerOn").checked = r.routerEnabled !== false;
  $("routerInfo").textContent = routerSummary(r.routingRules || DEFAULT_RULES);
});
$("routerOn").onchange = () => chrome.storage.sync.set({ routerEnabled: $("routerOn").checked });
$("editRules").onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
