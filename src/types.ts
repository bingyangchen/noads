export interface SelectorMap {
  general: string[];
  [hostname: string]: string[];
}

export interface SyncStorageState {
  enabled?: boolean;
  whitelist?: string[];
  selectorMap?: SelectorMap;
}
