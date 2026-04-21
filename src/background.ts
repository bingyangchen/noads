import { getRuntimeError, setSyncStorageState, syncStorageKeys } from "./browser";
import { createDefaultSelectorMap } from "./selectors";
import {
  normalizeEnabledState,
  normalizeSelectorMap,
  normalizeWhitelist,
} from "./storage";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(syncStorageKeys, (result) => {
    const runtimeError = getRuntimeError();
    if (runtimeError !== null) {
      console.error("Failed to read sync storage during installation.", runtimeError);
      return;
    }

    const existingSelectorMap = result.selectorMap;
    const generalSelectorsMissing = !Array.isArray(existingSelectorMap?.general);
    const enabledMissing = typeof result.enabled !== "boolean";
    const whitelistMissing = !Array.isArray(result.whitelist);

    if (!generalSelectorsMissing && !enabledMissing && !whitelistMissing) {
      return;
    }

    const defaultSelectorMap = createDefaultSelectorMap();
    const normalizedSelectorMap = normalizeSelectorMap(existingSelectorMap);

    void setSyncStorageState({
      enabled: normalizeEnabledState(result.enabled),
      whitelist: normalizeWhitelist(result.whitelist),
      selectorMap: generalSelectorsMissing
        ? {
            ...normalizedSelectorMap,
            general: defaultSelectorMap.general,
          }
        : normalizedSelectorMap,
    });
  });
});
