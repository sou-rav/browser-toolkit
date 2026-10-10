const $ = (id) => document.getElementById(id);
const box = $("rules");

function say(text, err) {
  const s = $("status");
  s.textContent = text;
  s.className = err ? "err" : "";
  clearTimeout(say.t);
  say.t = setTimeout(() => (s.textContent = ""), 3500);
}

function addRule(folder = "", exts = "") {
  const card = document.createElement("div");
  card.className = "rule";
  const head = document.createElement("div");
  head.className = "head";
  const f = document.createElement("input");
  f.type = "text"; f.className = "folder"; f.placeholder = "Folder name (e.g. Compressed)"; f.value = folder;
  const del = document.createElement("button");
  del.className = "del"; del.textContent = "Delete"; del.onclick = () => card.remove();
  head.append(f, del);
  const e = document.createElement("input");
  e.type = "text"; e.className = "exts"; e.placeholder = "Extensions separated by commas (e.g. zip, rar, 7z)"; e.value = exts;
  card.append(head, e);
  box.appendChild(card);
}

function fill(rules) {
  box.textContent = "";
  Object.entries(rules || {}).forEach(([folder, exts]) => addRule(folder, (exts || []).join(", ")));
}

function collect() {
  const rules = {};
  box.querySelectorAll(".rule").forEach((card) => {
    const folder = cleanFolder(card.querySelector(".folder").value);
    const exts = parseExts(card.querySelector(".exts").value);
    if (!folder || !exts.length) return;
    const merged = rules[folder] || [];
    exts.forEach((x) => { if (!merged.includes(x)) merged.push(x); });
    rules[folder] = merged;
  });
  return rules;
}

chrome.storage.sync.get({ routingRules: null, routerEnabled: true }, (r) => {
  fill(r.routingRules || DEFAULT_RULES);
  $("enabled").checked = r.routerEnabled !== false;
});

$("enabled").onchange = () => chrome.storage.sync.set({ routerEnabled: $("enabled").checked });
$("add").onclick = () => addRule();
$("reset").onclick = () => { fill(DEFAULT_RULES); say("Defaults loaded. Click Save to keep them."); };
$("save").onclick = () => {
  const rules = collect();
  fill(rules);
  chrome.storage.sync.set({ routingRules: rules }, () =>
    say(chrome.runtime.lastError ? "Couldn't save: " + chrome.runtime.lastError.message : "Saved.", !!chrome.runtime.lastError));
};

$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "browser-toolkit-rules.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
$("import").onclick = () => $("file").click();
$("file").onchange = async () => {
  const file = $("file").files[0];
  $("file").value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad");
    const rules = {};
    Object.entries(data).forEach(([folder, exts]) => {
      const list = Array.isArray(exts) ? exts : String(exts).split(",");
      const f = cleanFolder(folder), x = parseExts(list.join(","));
      if (f && x.length) rules[f] = x;
    });
    if (!Object.keys(rules).length) throw new Error("empty");
    fill(rules);
    say("Imported. Click Save to keep these rules.");
  } catch (_) {
    say("That file isn't a valid rules file.", true);
  }
};

/* ---------- Edge override ---------- */
chrome.storage.local.get({ edgeOverride: false }, ({ edgeOverride }) => { $("edgeOverride").checked = !!edgeOverride; });
$("edgeOverride").onchange = () => chrome.storage.local.set({ edgeOverride: $("edgeOverride").checked });
if (/\bEdg\//.test(navigator.userAgent)) $("edgeBox").classList.remove("hide");

chrome.storage.local.get({ discordSend: true }, ({ discordSend }) => { $("discordSend").checked = discordSend !== false; });
$("discordSend").onchange = () => chrome.storage.local.set({ discordSend: $("discordSend").checked });

for (const k of ["recEnabled", "shotsEnabled", "menuEnabled"]) {
  chrome.storage.local.get({ [k]: true }, (r) => { $(k).checked = r[k] !== false; });
  $(k).onchange = () => chrome.storage.local.set({ [k]: $(k).checked });
}
