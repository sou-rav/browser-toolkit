// Stitches full-page screenshot frames and makes a blob URL to download.
let canvas = null, ctx = null, scale = 1, total = 0, url = null;

const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

async function draw(m) {
  const img = await load(m.dataUrl);
  if (!canvas) {
    scale = img.width / m.vw;
    total = Math.min(m.total, Math.floor(30000 / scale));
    canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = Math.round(total * scale);
    ctx = canvas.getContext("2d");
  }
  ctx.drawImage(img, 0, Math.round(m.y * scale));
}

chrome.runtime.onMessage.addListener((m, _s, send) => {
  if (!m || m.target !== "offscreen") return;
  if (m.type === "frame") {
    draw(m).then(() => send({ ok: true, total }), (e) => send({ ok: false, error: String(e) }));
    return true;
  }
  if (m.type === "finish") {
    if (!canvas) { send({ ok: false }); return; }
    canvas.toBlob((b) => { url = URL.createObjectURL(b); send({ ok: true, url }); }, "image/png");
    return true;
  }
  if (m.type === "reset") {
    if (url) URL.revokeObjectURL(url);
    canvas = ctx = url = null;
    send({ ok: true });
  }
});
