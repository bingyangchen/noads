import { normalizeSyncStorageState } from "./storage";
import type { NormalizedSyncStorageState, SyncStorageState } from "./types";

export const syncStorageKeys = ["selectorMap", "enabled", "whitelist"] as const;

export function getRuntimeError(): Error | null {
  const runtimeError = chrome.runtime.lastError;
  return runtimeError ? new Error(runtimeError.message) : null;
}

export function getSyncStorageState(): Promise<NormalizedSyncStorageState> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(syncStorageKeys, (result) => {
      const runtimeError = getRuntimeError();
      if (runtimeError !== null) {
        reject(runtimeError);
        return;
      }

      resolve(normalizeSyncStorageState(result));
    });
  });
}

export function setSyncStorageState(
  partialState: Partial<SyncStorageState>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(partialState, () => {
      const runtimeError = getRuntimeError();
      if (runtimeError !== null) {
        reject(runtimeError);
        return;
      }

      resolve();
    });
  });
}

export function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const runtimeError = getRuntimeError();
      if (runtimeError !== null) {
        reject(runtimeError);
        return;
      }

      resolve(tabs[0] ?? null);
    });
  });
}

export function reloadTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, undefined, () => {
      const runtimeError = getRuntimeError();
      if (runtimeError !== null) {
        reject(runtimeError);
        return;
      }

      resolve();
    });
  });
}
