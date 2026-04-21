import { createDefaultSelectorMap } from "./selectors";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["selectorMap", "enabled"], (result) => {
    const existingMap = result.selectorMap;
    const generalSelectors = existingMap?.general;
    const generalSelectorsMissing = !Array.isArray(generalSelectors);

    if (generalSelectorsMissing) {
      const defaultSelectorMap = createDefaultSelectorMap();
      chrome.storage.sync.set({
        selectorMap: {
          ...(existingMap && typeof existingMap === "object" ? existingMap : {}),
          general: defaultSelectorMap.general,
        },
      });
    }

    if (result.enabled === undefined) {
      chrome.storage.sync.set({ enabled: true });
    }
  });
});
