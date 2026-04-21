import { createDefaultSelectorMap } from "./selectors";
import { normalizeEnabledState, normalizeWhitelist } from "./storage";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["selectorMap", "enabled", "whitelist"], (result) => {
    const existingMap = result.selectorMap;
    const generalSelectors = existingMap?.general;
    const generalSelectorsMissing = !Array.isArray(generalSelectors);
    const whitelistMissing = !Array.isArray(result.whitelist);

    if (generalSelectorsMissing) {
      const defaultSelectorMap = createDefaultSelectorMap();
      chrome.storage.sync.set({
        selectorMap: {
          ...(existingMap && typeof existingMap === "object" ? existingMap : {}),
          general: defaultSelectorMap.general,
        },
      });
    }

    if (result.enabled === undefined || typeof result.enabled !== "boolean") {
      chrome.storage.sync.set({ enabled: normalizeEnabledState(result.enabled) });
    }

    if (whitelistMissing) {
      chrome.storage.sync.set({ whitelist: normalizeWhitelist(result.whitelist) });
    }
  });
});
