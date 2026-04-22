import { getRuntimeError, setSyncStorageState, syncStorageKeys } from "./browser";
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

    const enabledMissing = typeof result.enabled !== "boolean";
    const whitelistMissing = !Array.isArray(result.whitelist);
    const selectorMapMissing = !result.selectorMap;

    if (!enabledMissing && !whitelistMissing && !selectorMapMissing) {
      return;
    }

    void setSyncStorageState({
      enabled: normalizeEnabledState(result.enabled),
      whitelist: normalizeWhitelist(result.whitelist),
      selectorMap: normalizeSelectorMap(result.selectorMap),
    });
  });
});
