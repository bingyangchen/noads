import { normalizeSyncStorageState } from "./storage";
import type { NormalizedSyncStorageState, SyncStorageState } from "./types";

export const syncStorageKeys = ["selectorMap", "enabled", "whitelist"] as const;

export function getSyncStorageState(): Promise<NormalizedSyncStorageState> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(syncStorageKeys, (result) => {
      resolve(normalizeSyncStorageState(result));
    });
  });
}

export function setSyncStorageState(
  partialState: Partial<SyncStorageState>,
): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(partialState, () => {
      resolve();
    });
  });
}

export function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] ?? null);
    });
  });
}

export function reloadTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, undefined, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}
