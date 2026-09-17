(function () {
  "use strict";

  const HIDDEN_VIDEO_ATTRIBUTE = "data-gmrv-hidden-video";
  const DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const VIDEO_LABEL_RE = /\bvideo\b/i;
  const MAX_SKIP_ATTEMPTS = 12;
  const DIRECTIONS_PATH_RE = /^\/maps\/dir(?:\/|$)/;

  let skipDirection = null;
  let skipAttempts = 0;
  let skipTimer = 0;
  let hideTimer = 0;
  let unitsTimer = 0;
  let enabled = true;

  function injectStyles() {
    if (document.getElementById("gmrv-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "gmrv-styles";
    style.textContent = `
      [${HIDDEN_VIDEO_ATTRIBUTE}="true"] {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function normalizedText(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function hasDurationBadge(element) {
    return Array.from(element.querySelectorAll("div, span")).some((child) =>
      DURATION_RE.test(normalizedText(child))
    );
  }

  function hasVideoLabel(element) {
    const label = element.getAttribute("aria-label") || element.getAttribute("data-tooltip") || "";
    return VIDEO_LABEL_RE.test(label) && !/fotos?\s+und\s+videos?/i.test(label);
  }

  function isGalleryVideo(element) {
    return hasVideoLabel(element) || hasDurationBadge(element);
  }

  function hideGalleryVideos() {
    hideTimer = 0;

    document.querySelectorAll("a[data-photo-index]").forEach((tile) => {
      if (!enabled || !isGalleryVideo(tile)) {
        return;
      }

      tile.setAttribute(HIDDEN_VIDEO_ATTRIBUTE, "true");
      tile.setAttribute("aria-hidden", "true");
      tile.setAttribute("tabindex", "-1");
    });
  }

  function showGalleryVideos() {
    document.querySelectorAll(`[${HIDDEN_VIDEO_ATTRIBUTE}="true"]`).forEach((tile) => {
      tile.removeAttribute(HIDDEN_VIDEO_ATTRIBUTE);
      tile.removeAttribute("aria-hidden");
      tile.removeAttribute("tabindex");
    });
  }

  function scheduleHideGalleryVideos() {
    if (hideTimer) {
      return;
    }

    hideTimer = window.setTimeout(hideGalleryVideos, 100);
  }

  function isDirectionsPage() {
    return DIRECTIONS_PATH_RE.test(window.location.pathname);
  }

  function enforceKilometers() {
    unitsTimer = 0;

    if (!isDirectionsPage()) {
      return;
    }

    const kilometersInput = document.querySelector(
      'input[name="pane.directions-options-units"][value="KILOMETERS"]'
    );

    if (!kilometersInput || kilometersInput.checked || kilometersInput.disabled) {
      return;
    }

    kilometersInput.click();
  }

  function scheduleEnforceKilometers() {
    if (unitsTimer) {
      return;
    }

    unitsTimer = window.setTimeout(enforceKilometers, 100);
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isCurrentViewerVideo() {
    if (Array.from(document.querySelectorAll("video")).some(isVisible)) {
      return true;
    }

    const visibleVideoLabels = Array.from(document.querySelectorAll('[aria-label]')).some((element) => {
      if (element.closest(`a[data-photo-index], [${HIDDEN_VIDEO_ATTRIBUTE}="true"]`)) {
        return false;
      }

      return isVisible(element) && hasVideoLabel(element);
    });

    if (visibleVideoLabels) {
      return true;
    }

    return Array.from(document.querySelectorAll("div, span")).some((element) => {
      if (element.closest(`a[data-photo-index], [${HIDDEN_VIDEO_ATTRIBUTE}="true"]`)) {
        return false;
      }

      return isVisible(element) && DURATION_RE.test(normalizedText(element));
    });
  }

  function findNavigationButton(direction) {
    const jsaction = direction === "next" ? "play.onRightClick" : "play.onLeftClick";
    const labels = direction === "next"
      ? [/^weiter$/i, /^next$/i, /^näch/i]
      : [/^zurück$/i, /^back$/i, /^previous$/i, /^vorher/i];

    const buttons = Array.from(document.querySelectorAll("button"));

    return buttons.find((button) => {
      if (!isVisible(button)) {
        return false;
      }

      const action = button.getAttribute("jsaction") || "";
      if (action.includes(jsaction)) {
        return true;
      }

      const label = button.getAttribute("aria-label") || "";
      return labels.some((pattern) => pattern.test(label));
    });
  }

  function continuePastVideo() {
    window.clearTimeout(skipTimer);

    if (!skipDirection || skipAttempts >= MAX_SKIP_ATTEMPTS || !isCurrentViewerVideo()) {
      skipDirection = null;
      skipAttempts = 0;
      return;
    }

    const button = findNavigationButton(skipDirection);
    if (!button) {
      skipDirection = null;
      skipAttempts = 0;
      return;
    }

    skipAttempts += 1;
    button.click();
    skipTimer = window.setTimeout(continuePastVideo, 450);
  }

  function scheduleSkip(direction) {
    if (!enabled) {
      return;
    }

    skipDirection = direction;
    skipAttempts = 0;
    window.clearTimeout(skipTimer);
    skipTimer = window.setTimeout(continuePastVideo, 450);
  }

  function handleKeydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    if (event.key === "ArrowRight") {
      scheduleSkip("next");
    } else if (event.key === "ArrowLeft") {
      scheduleSkip("previous");
    }
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      scheduleHideGalleryVideos();
      scheduleEnforceKilometers();

      if (skipDirection) {
        window.clearTimeout(skipTimer);
        skipTimer = window.setTimeout(continuePastVideo, 250);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "style", "class"]
    });
  }

  function applyEnabledState(nextEnabled) {
    enabled = nextEnabled;
    window.clearTimeout(skipTimer);
    skipDirection = null;
    skipAttempts = 0;

    if (enabled) {
      hideGalleryVideos();
    } else {
      showGalleryVideos();
    }
  }

  function watchSettings() {
    chrome.storage.sync.get({ enabled: true }, ({ enabled: storedEnabled }) => {
      applyEnabledState(storedEnabled);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes.enabled) {
        return;
      }

      applyEnabledState(changes.enabled.newValue);
    });
  }

  injectStyles();
  observeDom();
  watchSettings();
  scheduleEnforceKilometers();
  document.addEventListener("keydown", handleKeydown, true);
})();
