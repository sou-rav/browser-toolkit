// Shared helpers for the download folder rules (used by background, options and popup).
const DEFAULT_RULES = {
  "Compressed": ["zip", "rar", "7z", "tar", "gz"],
  "Video": ["mp4", "mkv", "avi", "mov", "webm"],
  "Images": ["jpg", "jpeg", "png", "gif", "webp", "svg"],
  "Documents": ["pdf", "doc", "docx", "xls", "xlsx", "txt"],
  "Code": ["js", "json", "bat", "sh", "py", "html", "css"]
};

// Folder names can't contain path characters, and can't start/end with dots or spaces.
const cleanFolder = (s) =>
  String(s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "").replace(/\s+/g, " ").trim();

// "tar.gz", ".ZIP" -> "tar.gz", "zip"
const cleanExt = (s) =>
  String(s || "").trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "").replace(/[^a-z0-9._+-]/g, "");

function parseExts(raw) {
  const out = [];
  String(raw || "").split(/[,\s]+/).forEach((e) => {
    const c = cleanExt(e);
    if (c && !out.includes(c)) out.push(c);
  });
  return out;
}

// Returns the folder whose longest matching extension fits the file name (so tar.gz beats gz), or "".
function matchFolder(rules, filename) {
  const lower = String(filename || "").toLowerCase();
  let best = "", bestLen = 0;
  for (const [folder, exts] of Object.entries(rules || {})) {
    const f = cleanFolder(folder);
    if (!f || !Array.isArray(exts)) continue;
    for (const raw of exts) {
      const e = cleanExt(raw);
      if (e && lower.endsWith("." + e) && e.length > bestLen) { best = f; bestLen = e.length; }
    }
  }
  return best;
}
