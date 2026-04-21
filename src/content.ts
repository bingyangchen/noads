import { getSyncStorageState } from "./browser";
import { isUrlWhitelisted } from "./domain";
import { createCachedSelectorValidator } from "./selectorValidation";
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
const isValidCssSelector = createCachedSelectorValidator((selector, error) => {
  console.warn("Ignoring invalid CSS selector.", selector, error);
});

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

interface ReconcileAdBlockerOptions {
  previouslyWhitelisted: boolean;
  previouslyEnabled: boolean;
  whitelistChanged: boolean;
}

function reconcileAdBlocker(options: ReconcileAdBlockerOptions): void {
  disconnectAdBlocker();

  const isCurrentlyWhitelisted = isCurrentUrlWhitelisted();
  if (isCurrentlyWhitelisted) {
    if (
      options.whitelistChanged &&
      options.previouslyEnabled &&
      !options.previouslyWhitelisted &&
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
    if (
      mutations.some(
        (mutation) => mutation.type === "childList" || mutation.type === "attributes",
      )
    ) {
      scheduleAdRemoval();
    }
  });
  const observerTarget = document.body ?? document.documentElement;
  mutationObserver.observe(observerTarget, {
    attributes: true,
    attributeFilter: ["class", "hidden", "id", "src", "style"],
    childList: true,
    subtree: true,
  });
}

function applyStorageState(syncStorageState: NormalizedSyncStorageState): void {
  extensionState.enabled = syncStorageState.enabled;
  extensionState.whitelist = syncStorageState.whitelist;
  extensionState.selectorMap = syncStorageState.selectorMap;
  reconcileAdBlocker({
    previouslyEnabled: false,
    previouslyWhitelisted: false,
    whitelistChanged: false,
  });
}

void getSyncStorageState()
  .then((syncStorageState) => {
    applyStorageState(syncStorageState);
  })
  .catch((error: unknown) => {
    console.error("Failed to load sync storage state.", error);
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

  reconcileAdBlocker({
    previouslyWhitelisted,
    previouslyEnabled,
    whitelistChanged: changes.whitelist !== undefined,
  });
});
