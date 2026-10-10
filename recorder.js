const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

const DEFAULTS = { sysAudio: true, muteLocal: false, mic: false, format: "mp4", res: "orig", fps: "30", countdown: "3", autosave: true, meetStop: true, autoPrompt: true, crash: true };
const FIELDS = ["sysAudio", "muteLocal", "mic", "format", "res", "fps", "countdown", "autosave", "meetStop", "autoPrompt", "crash"];

let disp = null, stream = null, micStream = null, mixCtx = null, recorder = null;
let chunks = [], status = "idle", cancelled = false;
let startedAt = 0, pausedTotal = 0, pauseStart = 0, ticker = null, tickCount = 0;
let blob = null, blobUrl = null, fileExt = "mp4";
let meetingName = null, pendingName = null, crashOn = false;

/* ---------- helpers ---------- */
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function fmt(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (h ? pad(h) + ":" : "") + pad(m) + ":" + pad(s % 60);
}
function shortTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 600) return Math.floor(s / 60) + ":" + pad(s % 60);
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}
function badge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch (_) {}
}
const msg = (t) => ($("msg").textContent = t || "");
const elapsed = () => (status === "paused" ? pauseStart : Date.now()) - startedAt - pausedTotal;
const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

const MP4_TYPES = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
const WEBM_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const pickMime = (list) => list.find((t) => MediaRecorder.isTypeSupported(t));

/* ---------- storage (IndexedDB): recovery chunks + chosen folder ---------- */
let dbp;
const db = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open("mmv-recorder", 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore("chunks", { autoIncrement: true });
    r.result.createObjectStore("meta");
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const rcAdd = (b) => tx("chunks", "readwrite", (s) => s.add(b)).catch(() => {});
const rcMeta = (o) => tx("meta", "readwrite", (s) => s.put(o, "rec")).catch(() => {});
async function rcClear() {
  try {
    await tx("chunks", "readwrite", (s) => s.clear());
    await tx("meta", "readwrite", (s) => s.delete("rec"));
  } catch (_) {}
}
const getFolder = () => tx("meta", "readonly", (s) => s.get("folder"));
const setFolder = (h) => tx("meta", "readwrite", (s) => s.put(h, "folder"));
const delFolder = () => tx("meta", "readwrite", (s) => s.delete("folder"));

/* ---------- saving (chosen folder, or Downloads) ---------- */
async function uniqueName(dir, name) {
  const dot = name.lastIndexOf(".");
  const base = name.slice(0, dot), ext = name.slice(dot);
  let n = name, i = 1;
  while (true) {
    try { await dir.getFileHandle(n); n = `${base} (${i++})${ext}`; }
    catch (e) { if (e.name === "NotFoundError") return n; throw e; }
  }
}
async function saveBlobAs(b, name) {
  let dir = null;
  try { dir = await getFolder(); } catch (_) {}
  if (dir) {
    try {
      if ((await dir.queryPermission({ mode: "readwrite" })) === "granted") {
        const n = await uniqueName(dir, name);
        const fh = await dir.getFileHandle(n, { create: true });
        const w = await fh.createWritable();
        await w.write(b);
        await w.close();
        return `${dir.name}\\${n}`;
      }
    } catch (_) {}
  }
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return dir ? "Downloads (the chosen folder needs permission, click “Allow access”)" : "your Downloads folder";
}

async function refreshFolderUI() {
  let h = null;
  try { h = await getFolder(); } catch (_) {}
  if (!h) {
    $("folderName").textContent = "Downloads (default)";
    $("allowFolder").classList.add("hide");
    $("resetFolder").classList.add("hide");
    return;
  }
  let perm = "prompt";
  try { perm = await h.queryPermission({ mode: "readwrite" }); } catch (_) {}
  $("folderName").textContent = h.name + (perm === "granted" ? "" : " (needs permission)");
  $("allowFolder").classList.toggle("hide", perm === "granted");
  $("resetFolder").classList.remove("hide");
}
$("chooseFolder").onclick = async () => {
  try {
    const h = await showDirectoryPicker({ id: "mmv-recordings", mode: "readwrite", startIn: "videos" });
    await setFolder(h);
    msg("");
  } catch (e) {
    if (e.name !== "AbortError") msg("Chrome wouldn't allow that folder. Pick or create a subfolder (not Downloads, Documents or Desktop themselves).");
  }
  refreshFolderUI();
};
$("allowFolder").onclick = async () => {
  try { const h = await getFolder(); await h.requestPermission({ mode: "readwrite" }); } catch (_) {}
  refreshFolderUI();
};
$("resetFolder").onclick = async () => { await delFolder(); refreshFolderUI(); };

/* ---------- meeting name for file names ---------- */
async function activeMeetingName() {
  try {
    const { activeMeeting } = await chrome.storage.local.get("activeMeeting");
    if (activeMeeting && Date.now() - activeMeeting.ts < 20000) return activeMeeting.name;
  } catch (_) {}
  return null;
}
function baseName() {
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const n = meetingName ? cleanName(meetingName) : "";
  return n ? `${n} ${date}` : `Recording ${stamp()}`;
}
const fileName = () => `${baseName()}.${fileExt}`;

/* ---------- settings ---------- */
function readSettings() {
  const s = {};
  FIELDS.forEach((f) => {
    const el = $(f);
    s[f] = el.type === "checkbox" ? el.checked : el.value;
  });
  return s;
}
async function loadSettings() {
  const { recSettings } = await chrome.storage.local.get({ recSettings: DEFAULTS });
  const s = { ...DEFAULTS, ...recSettings };
  FIELDS.forEach((f) => {
    const el = $(f);
    if (el.type === "checkbox") el.checked = !!s[f]; else el.value = s[f];
    el.addEventListener("change", () => chrome.storage.local.set({ recSettings: readSettings() }));
  });
  if (!pickMime(MP4_TYPES)) {
    $("format").querySelector('option[value="mp4"]').textContent = "MP4 (not supported by this browser)";
    $("format").querySelector('option[value="mp4"]').disabled = true;
    if ($("format").value === "mp4") $("format").value = "webm";
  }
}
// "Don't ask again" on the in-meeting prompt changes this setting from another page
chrome.storage.onChanged.addListener((c) => {
  if (c.recSettings && c.recSettings.newValue && status !== "recording" && status !== "paused") {
    $("autoPrompt").checked = c.recSettings.newValue.autoPrompt !== false;
  }
});

/* ---------- UI state ---------- */
function setStatus(s) {
  status = s;
  const busy = s === "countdown" || s === "recording" || s === "paused";
  $("capture").disabled = busy;
  $("capture").textContent = s === "stopped" ? "Record again" : "Capture screen";
  $("pause").disabled = !(s === "recording" || s === "paused");
  $("pause").textContent = s === "paused" ? "Resume" : "Pause";
  $("stop").disabled = !busy;
  $("stop").textContent = s === "countdown" ? "Cancel" : "Stop";
  FIELDS.forEach((f) => ($(f).disabled = busy));
  const pill = $("state");
  pill.className = "pill" + (s === "recording" ? " rec" : s === "paused" ? " paused" : "");
  pill.textContent = { idle: "Ready", countdown: "Starting…", recording: "● Recording", paused: "Paused", stopped: "Finished" }[s];
}

function tick() {
  const el = elapsed();
  $("timer").textContent = fmt(el);
  document.title = (status === "paused" ? "⏸ Paused " : "● REC ") + fmt(el);
  tickCount++;
  if (status === "paused") badge("II", "#f9ab00");
  else badge(tickCount % 4 < 2 ? "REC" : shortTime(el), "#d93025");
  try { chrome.action.setTitle({ title: `${status === "paused" ? "Paused" : "Recording"} ${fmt(el)}` }); } catch (_) {}
}

/* ---------- capture ---------- */
async function startCapture() {
  msg("");
  const s = readSettings();
  cancelled = false;
  releasePreview();

  const videoC = { frameRate: { ideal: +s.fps, max: +s.fps } };
  if (s.res !== "orig") {
    const h = +s.res;
    videoC.height = { max: h };
    videoC.width = { max: Math.round((h * 16) / 9) };
  }
  try {
    disp = await navigator.mediaDevices.getDisplayMedia({
      video: videoC,
      audio: s.sysAudio ? { suppressLocalAudioPlayback: !!s.muteLocal, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      systemAudio: "include",
      surfaceSwitching: "include"
    });
  } catch (e) {
    msg("Capture cancelled.");
    return;
  }

  meetingName = pendingName || (await activeMeetingName());
  pendingName = null;

  if (s.mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (_) {
      msg("Microphone was blocked, recording without it.");
    }
  }

  const tabAudio = disp.getAudioTracks();
  if (s.sysAudio && !tabAudio.length) {
    msg("No tab audio was shared. Next time switch on “Share tab audio” in Chrome's picker.");
  }
  let audioTrack = null;
  if (tabAudio.length || micStream) {
    mixCtx = new AudioContext();
    const dest = mixCtx.createMediaStreamDestination();
    if (tabAudio.length) mixCtx.createMediaStreamSource(new MediaStream(tabAudio)).connect(dest);
    if (micStream) mixCtx.createMediaStreamSource(micStream).connect(dest);
    audioTrack = dest.stream.getAudioTracks()[0];
  }
  const vt = disp.getVideoTracks()[0];
  stream = new MediaStream([vt, ...(audioTrack ? [audioTrack] : [])]);
  vt.addEventListener("ended", () => { if (status === "recording" || status === "paused") stopRecording(); });

  const n = +s.countdown;
  if (n > 0) {
    setStatus("countdown");
    const ok = await runCountdown(n);
    if (!ok) return cleanupMedia(true);
  }

  const mime = s.format === "mp4" ? pickMime(MP4_TYPES) : pickMime(WEBM_TYPES);
  const st = vt.getSettings();
  const px = (st.width || 1920) * (st.height || 1080);
  const bps = Math.round(Math.min(16e6, Math.max(2.5e6, px * (+s.fps) * 0.07)));
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128000 });
  } catch (e) {
    msg("Couldn't start the recorder: " + e.message);
    return cleanupMedia(true);
  }
  chunks = [];
  crashOn = !!s.crash;
  if (crashOn) {
    await rcClear();
    await rcMeta({ type: recorder.mimeType || mime, name: meetingName, startedAt: Date.now() });
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) {
      chunks.push(e.data);
      if (crashOn) rcAdd(e.data);
    }
  };
  recorder.onstop = finalize;
  recorder.start(1000);

  startedAt = Date.now();
  pausedTotal = 0;
  tickCount = 0;
  setStatus("recording");
  tick();
  ticker = setInterval(tick, 500);
  msg(meetingName ? `Recording “${meetingName}”. Keep this tab open.` : "Recording. Switch to the tab you want to capture. Keep this tab open.");
}

async function runCountdown(n) {
  $("overlay").classList.add("on");
  for (let i = n; i > 0; i--) {
    if (cancelled) break;
    $("count").textContent = i;
    badge(String(i), "#1a73e8");
    document.title = `Starting in ${i}…`;
    await sleep(1000);
  }
  $("overlay").classList.remove("on");
  return !cancelled;
}

function togglePause() {
  if (status === "recording") {
    recorder.pause();
    pauseStart = Date.now();
    setStatus("paused");
    tick();
  } else if (status === "paused") {
    pausedTotal += Date.now() - pauseStart;
    recorder.resume();
    setStatus("recording");
    tick();
  }
}

function stopRecording() {
  if (status === "countdown") { cancelled = true; return; }
  if (status !== "recording" && status !== "paused") return;
  if (status === "paused") pausedTotal += Date.now() - pauseStart;
  clearInterval(ticker);
  try { recorder.stop(); } catch (_) { finalize(); }
}

function cleanupMedia(toIdle) {
  [disp, micStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (mixCtx) { try { mixCtx.close(); } catch (_) {} }
  disp = stream = micStream = mixCtx = null;
  badge("");
  try { chrome.action.setTitle({ title: "Browser Toolkit" }); } catch (_) {}
  document.title = "Screen Recorder";
  $("overlay").classList.remove("on");
  if (toIdle) { setStatus("idle"); msg(cancelled ? "Cancelled." : ""); }
}

async function finalize() {
  clearInterval(ticker);
  const type = (recorder && recorder.mimeType) || "video/mp4";
  fileExt = type.includes("mp4") ? "mp4" : "webm";
  blob = new Blob(chunks, { type });
  chunks = [];
  cleanupMedia(false);
  if (!blob.size) {
    setStatus("idle");
    msg("Nothing was recorded.");
    return;
  }
  blobUrl = URL.createObjectURL(blob);
  $("preview").src = blobUrl;
  $("result").classList.remove("hide");
  setStatus("stopped");
  if (readSettings().autosave) {
    const where = await saveBlobAs(blob, fileName());
    await rcClear();
    msg(`Saved as “${fileName()}” in ${where}.`);
  } else {
    msg("Finished. Click “Save to your computer”.");
  }
}

function releasePreview() {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
  blob = null;
  $("preview").removeAttribute("src");
  $("result").classList.add("hide");
}

/* ---------- crash recovery ---------- */
async function checkRecovery() {
  let list = [], meta = null;
  try {
    list = await tx("chunks", "readonly", (s) => s.getAll());
    meta = await tx("meta", "readonly", (s) => s.get("rec"));
  } catch (_) { return; }
  if (!list || !list.length) return;
  const size = list.reduce((a, b) => a + b.size, 0);
  $("recoverInfo").textContent = ` ${mb(size)}${meta && meta.name ? " · " + meta.name : ""}. It wasn't saved before the page closed.`;
  $("recoverBox").classList.remove("hide");
  $("recoverSave").onclick = async () => {
    const type = (meta && meta.type) || "video/webm";
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const base = meta && meta.name ? `${cleanName(meta.name)} (recovered) ${stamp()}` : `Recovered recording ${stamp()}`;
    const where = await saveBlobAs(new Blob(list, { type }), `${base}.${ext}`);
    await rcClear();
    $("recoverBox").classList.add("hide");
    msg(`Recovered recording saved in ${where}. If it won't open, it was cut off before Chrome could finish the file.`);
  };
  $("recoverDiscard").onclick = async () => { await rcClear(); $("recoverBox").classList.add("hide"); };
}

/* ---------- meeting auto-start prompt ---------- */
function showAuto(name) {
  if (status !== "idle" && status !== "stopped") return;
  pendingName = name || null;
  $("autoName").textContent = name ? " — " + name : "";
  $("autoBox").classList.remove("hide");
}
$("autoGo").onclick = () => { $("autoBox").classList.add("hide"); startCapture(); };
$("autoNo").onclick = () => { pendingName = null; $("autoBox").classList.add("hide"); };

/* ---------- wiring ---------- */
$("capture").onclick = () => { $("autoBox").classList.add("hide"); startCapture(); };
$("pause").onclick = togglePause;
$("stop").onclick = stopRecording;
$("save").onclick = async () => {
  if (!blob) return;
  const where = await saveBlobAs(blob, fileName());
  await rcClear();
  msg(`Saved as “${fileName()}” in ${where}.`);
};

chrome.runtime.onMessage.addListener((m, _s, send) => {
  if (!m) return;
  const live = status === "recording" || status === "paused" || status === "countdown";
  if (m.type === "auto-prompt") { showAuto(m.name); return; }
  if (m.type === "meeting-joined") { if (live && !meetingName) meetingName = m.name; return; }
  if (m.type === "meeting-ended") {
    if (live && !meetingName) meetingName = m.name;
    if ((status === "recording" || status === "paused") && $("meetStop").checked) {
      msg("Meeting ended. Stopping the recording…");
      setTimeout(() => { if (status === "recording" || status === "paused") stopRecording(); }, 2000);
    }
    return;
  }
  if (m.type === "rec-status") {
    send({ status, elapsed: status === "recording" || status === "paused" ? elapsed() : 0 });
  } else if (m.type === "rec-cmd") {
    if (m.cmd === "pause" && status === "recording") togglePause();
    else if (m.cmd === "resume" && status === "paused") togglePause();
    else if (m.cmd === "stop") stopRecording();
    send({ ok: true });
  }
});

window.addEventListener("beforeunload", (e) => {
  if (status === "recording" || status === "paused" || status === "countdown") {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("pagehide", () => badge(""));

loadSettings().then(async () => {
  setStatus("idle");
  refreshFolderUI();
  checkRecovery();
  const p = new URLSearchParams(location.search);
  if (p.get("auto") === "1") showAuto(p.get("name") || "");
});
