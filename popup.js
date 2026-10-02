chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (_) {}
  document.getElementById("site").textContent = host || "this page";
  const box = document.getElementById("on");
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
});

