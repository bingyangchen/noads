import { getSyncStorageState } from "./browser";
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
const selectorValidationRoot = document.createDocumentFragment();

let mutationObserver: MutationObserver | null = null;
let pendingAdRemovalFrame: number | null = null;
const validSelectors = new Set<string>();
const invalidSelectors = new Set<string>();

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

function isValidCssSelector(selector: string): boolean {
  if (validSelectors.has(selector)) {
    return true;
  }

  if (invalidSelectors.has(selector)) {
    return false;
  }

  try {
    selectorValidationRoot.querySelector(selector);
    validSelectors.add(selector);
    return true;
  } catch (error) {
    invalidSelectors.add(selector);
    console.warn("Ignoring invalid CSS selector.", selector, error);
    return false;
  }
}

function removeAds(): void {
  if (!extensionState.enabled || isCurrentUrlWhitelisted()) return;
  const applicableSelectors = getApplicableSelectors(
    extensionState.selectorMap,
    window.location.hostname,
  ).filter(isValidCssSelector);

  applicableSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => element.remove());
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
  previouslyEnabled: boolean,
  reloadWhenNowWhitelisted: boolean,
): void {
  disconnectAdBlocker();

  const isCurrentlyWhitelisted = isCurrentUrlWhitelisted();
  if (isCurrentlyWhitelisted) {
    if (
      reloadWhenNowWhitelisted &&
      previouslyEnabled &&
      !previouslyWhitelisted &&
      window.top === window
    ) {
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
  reconcileAdBlocker(false, false, false);
}

void getSyncStorageState().then((syncStorageState) => {
  applyStorageState(syncStorageState);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  const previouslyEnabled = extensionState.enabled;
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

  reconcileAdBlocker(
    previouslyWhitelisted,
    previouslyEnabled,
    changes.whitelist !== undefined,
  );
});
