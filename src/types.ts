export interface SelectorMap {
  general: string[];
  [hostname: string]: string[];
}

export interface SyncStorageState {
  enabled?: boolean;
  whitelist?: string[];
  selectorMap?: SelectorMap;
}

export interface NormalizedSyncStorageState {
  enabled: boolean;
  whitelist: string[];
  selectorMap: SelectorMap;
}
