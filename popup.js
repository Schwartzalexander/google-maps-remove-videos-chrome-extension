(function () {
  "use strict";

  const enabledToggle = document.getElementById("enabledToggle");
  const statusText = document.getElementById("statusText");

  function updateStatus(enabled) {
    enabledToggle.checked = enabled;
    statusText.textContent = enabled ? "Aktiv" : "Videos werden angezeigt";
  }

  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
    updateStatus(enabled);
  });

  enabledToggle.addEventListener("change", () => {
    const enabled = enabledToggle.checked;
    updateStatus(enabled);
    chrome.storage.sync.set({ enabled });
  });
})();
