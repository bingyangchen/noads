import { isUrlWhitelisted } from "./domain";
import { getApplicableSelectors } from "./selectors";
import {
  normalizeEnabledState,
  normalizeSelectorMap,
  normalizeSyncStorageState,
  normalizeWhitelist,
} from "./storage";
import type { NormalizedSyncStorageState } from "./types";

const extensionState: NormalizedSyncStorageState = normalizeSyncStorageState({});

let mutationObserver: MutationObserver | null = null;
let pendingAdRemovalFrame: number | null = null;

function cancelPendingAdRemoval(): void {
  if (pendingAdRemovalFrame !== null) {
    window.cancelAnimationFrame(pendingAdRemovalFrame);
    pendingAdRemovalFrame = null;
  }
}

function isCurrentUrlWhitelisted(): boolean {
  return isUrlWhitelisted(window.location.href, extensionState.whitelist);
}

function disconnectAdBlocker(): void {
  cancelPendingAdRemoval();
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

function removeAds(): void {
  if (!extensionState.enabled || isCurrentUrlWhitelisted()) return;
  const applicableSelectors = getApplicableSelectors(
    extensionState.selectorMap,
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

function reconcileAdBlocker(
  previouslyWhitelisted: boolean,
  reloadWhenNowWhitelisted: boolean,
): void {
  disconnectAdBlocker();

  const isCurrentlyWhitelisted = isCurrentUrlWhitelisted();
  if (isCurrentlyWhitelisted) {
    if (reloadWhenNowWhitelisted && !previouslyWhitelisted && window.top === window) {
      location.reload();
    }
    return;
  }

  if (extensionState.enabled) {
    initAdBlocker();
  }
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

function applyStorageState(syncStorageState: NormalizedSyncStorageState): void {
  extensionState.enabled = syncStorageState.enabled;
  extensionState.whitelist = syncStorageState.whitelist;
  extensionState.selectorMap = syncStorageState.selectorMap;
  reconcileAdBlocker(false, false);
}

chrome.storage.sync.get(["selectorMap", "enabled", "whitelist"], (result) => {
  applyStorageState(normalizeSyncStorageState(result));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  const previouslyWhitelisted = isCurrentUrlWhitelisted();

  if (changes.enabled) {
    extensionState.enabled = normalizeEnabledState(changes.enabled.newValue);
  }
  if (changes.selectorMap) {
    extensionState.selectorMap = normalizeSelectorMap(changes.selectorMap.newValue);
  }
  if (changes.whitelist) {
    extensionState.whitelist = normalizeWhitelist(changes.whitelist.newValue);
  }

  reconcileAdBlocker(previouslyWhitelisted, changes.whitelist !== undefined);
});
