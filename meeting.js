// Watches Google Meet / Zoom (web): offers to record when you join, keeps the
// "active meeting" name fresh for file names, and reports when the meeting ends.
(() => {
  const isMeet = location.hostname === "meet.google.com";
  let inCall = false;
  let lastBeat = 0;

  const text = () => (document.body ? document.body.innerText || "" : "");

  function label() {
    if (isMeet) {
      const m = location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
      return m ? `Google Meet - ${m[1].toLowerCase()}` : "Google Meet";
    }
    const m = location.pathname.match(/\/(?:wc\/|j\/)?(\d{9,11})/);
    return m ? `Zoom - ${m[1]}` : "Zoom meeting";
  }

  function inMeeting() {
    if (isMeet) {
      return !!document.querySelector(
        'button[aria-label*="Leave call" i], button[aria-label*="Leave meeting" i], [data-tooltip*="Leave call" i]'
      );
    }
    return !!document.querySelector(
      'button[aria-label="Leave" i], button[aria-label*="Leave meeting" i], .footer__leave-btn, .footer-button__leave-btn, [class*="leave-meeting"]'
    );
  }

  function ended() {
    const t = text();
    if (isMeet) {
      if (!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(location.pathname)) return true;
      return /you left the meeting|you've left the meeting|meeting has ended|call has ended|you were removed|removed from the meeting|you.ve been removed/i.test(t);
    }
    return (
      /\/(wc\/leave|postattendee)/i.test(location.pathname) ||
      /meeting has been ended|this meeting has been ended by host|the meeting has ended|you have left the meeting|you've been removed|removed from the meeting/i.test(t)
    );
  }

  const send = (m) => { try { chrome.runtime.sendMessage(m, () => void chrome.runtime.lastError); } catch (_) {} };

  function showBanner(name) {
    if (document.getElementById("mmv-banner-host")) return;
    const host = document.createElement("div");
    host.id = "mmv-banner-host";
    host.style.cssText = "all:initial;position:fixed;right:16px;bottom:100px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .b{background:#2b2b2e;color:#f0f0f0;border-radius:12px;padding:12px 14px;width:250px;
          box-shadow:0 6px 24px rgba(0,0,0,.5);font:13px/1.35 "Segoe UI",system-ui,sans-serif}
        .t{font-weight:600;margin-bottom:2px}
        .n{color:#a8a8ad;margin-bottom:10px;word-break:break-all}
        .r{display:flex;gap:6px;flex-wrap:wrap}
        button{border:0;border-radius:8px;padding:7px 11px;font:inherit;cursor:pointer;background:#414145;color:#f0f0f0}
        button.go{background:#d93025;color:#fff}
        button.nv{background:transparent;color:#a8a8ad;padding:7px 4px}
      </style>
      <div class="b"><div class="t">Record this meeting?</div><div class="n"></div>
        <div class="r"><button class="go">Record</button><button class="no">Not now</button><button class="nv">Don't ask again</button></div></div>`;
    root.querySelector(".n").textContent = name;
    const close = () => host.remove();
    root.querySelector(".go").onclick = () => { send({ type: "open-recorder", name }); close(); };
    root.querySelector(".no").onclick = close;
    root.querySelector(".nv").onclick = () => {
      chrome.storage.local.get({ recSettings: {} }, ({ recSettings }) =>
        chrome.storage.local.set({ recSettings: { ...recSettings, autoPrompt: false } }));
      close();
    };
    document.documentElement.appendChild(host);
    setTimeout(close, 30000);
  }

  function onJoin() {
    const name = label();
    send({ type: "meeting-joined", name });
    chrome.storage.local.get({ recSettings: {} }, ({ recSettings }) => {
      if (recSettings.autoPrompt === false) return;
      try {
        chrome.runtime.sendMessage({ type: "rec-status" }, (r) => {
          void chrome.runtime.lastError;
          if (r && ["recording", "paused", "countdown"].includes(r.status)) return;
          showBanner(name);
        });
      } catch (_) {}
    });
  }

  function check() {
    if (inMeeting()) {
      if (!inCall) { inCall = true; onJoin(); }
      if (Date.now() - lastBeat > 5000) {
        lastBeat = Date.now();
        try { chrome.storage.local.set({ activeMeeting: { name: label(), ts: Date.now() } }); } catch (_) {}
      }
      return;
    }
    if (inCall && ended()) {
      inCall = false;
      try { chrome.storage.local.remove("activeMeeting"); } catch (_) {}
      send({ type: "meeting-ended", name: label(), site: location.hostname });
    }
  }

  let recEnabled = true;
  try {
    chrome.storage.local.get({ recEnabled: true }, (r) => (recEnabled = r.recEnabled !== false));
    chrome.storage.onChanged.addListener((c) => { if (c.recEnabled) recEnabled = c.recEnabled.newValue !== false; });
  } catch (_) {}
  setInterval(() => { if (recEnabled) check(); }, 1500);
})();
