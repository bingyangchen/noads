import { isUrlWhitelisted } from "./domain";
import { getApplicableSelectors } from "./selectors";
import type { SelectorMap, SyncStorageState } from "./types";

let isEnabled = true;
let whitelist: string[] = [];
let selectorMap: SelectorMap = {
  general: [],
};

let mutationObserver: MutationObserver | null = null;
let pendingAdRemovalFrame: number | null = null;

function cancelPendingAdRemoval(): void {
  if (pendingAdRemovalFrame !== null) {
    window.cancelAnimationFrame(pendingAdRemovalFrame);
    pendingAdRemovalFrame = null;
  }
}

function disconnectAdBlocker(): void {
  cancelPendingAdRemoval();
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

function removeAds(): void {
  if (!isEnabled || isUrlWhitelisted(window.location.href, whitelist)) return;
  const applicableSelectors = getApplicableSelectors(
    selectorMap,
    window.location.hostname,
  );
  applicableSelectors.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((element) => element.remove());
    } catch {}
  });
}

function scheduleAdRemoval(): void {
  if (pendingAdRemovalFrame !== null) {
    return;
  }

  pendingAdRemovalFrame = window.requestAnimationFrame(() => {
    pendingAdRemovalFrame = null;
    removeAds();
  });
}

function initAdBlocker(): void {
  removeAds();
  mutationObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === "childList")) {
      scheduleAdRemoval();
    }
  });
  const observerTarget = document.body ?? document.documentElement;
  mutationObserver.observe(observerTarget, { childList: true, subtree: true });
}

function applySyncStorageResult(result: SyncStorageState): void {
  isEnabled = result.enabled !== false;
  whitelist = result.whitelist ?? [];
  selectorMap = result.selectorMap ?? { general: [] };
  syncAdBlockerWithCurrentState();
}

function syncAdBlockerWithCurrentState(): void {
  disconnectAdBlocker();
  if (!isEnabled || isUrlWhitelisted(window.location.href, whitelist)) return;
  initAdBlocker();
}

function applyWhitelistUpdate(updatedWhitelist: string[]): void {
  whitelist = updatedWhitelist;
  disconnectAdBlocker();
  if (isUrlWhitelisted(window.location.href, whitelist)) {
    if (window.top === window) {
      location.reload();
    }
    return;
  } else if (isEnabled) {
    initAdBlocker();
  }
}

chrome.storage.sync.get(["selectorMap", "enabled", "whitelist"], (result) => {
  applySyncStorageResult(result);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.enabled) {
    isEnabled = changes.enabled.newValue !== false;
  }
  if (changes.selectorMap) {
    selectorMap = changes.selectorMap.newValue ?? { general: [] };
  }
  if (changes.whitelist) {
    applyWhitelistUpdate(changes.whitelist.newValue ?? []);
    return;
  }
  syncAdBlockerWithCurrentState();
});
