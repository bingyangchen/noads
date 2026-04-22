import { getSyncStorageState } from "./browser";
import { isUrlWhitelisted } from "./domain";
import type { RuntimeMessage, RuntimeMessageResponse } from "./messages";
import { startPicker } from "./picker";
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
let resolvedApplicableSelectors: string[] = [];
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

function updateResolvedApplicableSelectors(): void {
  if (!extensionState.enabled || isCurrentUrlWhitelisted()) {
    resolvedApplicableSelectors = [];
    return;
  }

  resolvedApplicableSelectors = getApplicableSelectors(
    extensionState.selectorMap,
    window.location.hostname,
  ).filter(isValidCssSelector);
}

function removeAds(): void {
  if (resolvedApplicableSelectors.length === 0) {
    return;
  }

  document
    .querySelectorAll(resolvedApplicableSelectors.join(","))
    .forEach((element) => element.remove());
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
    resolvedApplicableSelectors = [];
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
    updateResolvedApplicableSelectors();
    initAdBlocker();
    return;
  }

  resolvedApplicableSelectors = [];
}

function initAdBlocker(): void {
  removeAds();
  if (resolvedApplicableSelectors.length === 0) {
    return;
  }

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

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeMessageResponse) => void,
  ) => {
    if (message.type !== "START_PICKER") {
      return undefined;
    }

    if (window.top !== window) {
      sendResponse({ type: "PICKER_UNAVAILABLE", reason: "not-top-frame" });
      return false;
    }

    const hostname = window.location.hostname;
    const supportsDomainRules = /^https?:$/.test(window.location.protocol);

    void startPicker({ hostname, supportsDomainRules });
    sendResponse({ type: "PICKER_STARTED" });
    return false;
  },
);

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
