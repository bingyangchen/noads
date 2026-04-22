import { normalizeDomainEntry } from "./domain";
import { createDefaultSelectorMap, mergeUniqueSelectors } from "./selectors";
import type { NormalizedSyncStorageState, SelectorMap } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedItems = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return [...new Set(normalizedItems)];
}

export function normalizeEnabledState(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export function normalizeSelectorMap(value: unknown): SelectorMap {
  const defaultSelectorMap = createDefaultSelectorMap();

  if (!isRecord(value)) {
    return defaultSelectorMap;
  }

  const normalizedGeneral = Array.isArray(value.general)
    ? normalizeStringList(value.general)
    : [...defaultSelectorMap.general];

  const normalizedSelectorMap: SelectorMap = {
    general: normalizedGeneral,
  };

  for (const [hostname, selectors] of Object.entries(value)) {
    if (hostname === "general") {
      continue;
    }

    const normalizedHostname = normalizeDomainEntry(hostname);
    const normalizedSelectors = normalizeStringList(selectors);

    if (normalizedHostname === null || normalizedSelectors.length === 0) {
      continue;
    }

    normalizedSelectorMap[normalizedHostname] = mergeUniqueSelectors(
      normalizedSelectorMap[normalizedHostname] ?? [],
      normalizedSelectors,
    );
  }

  return normalizedSelectorMap;
}

export function normalizeWhitelist(value: unknown): string[] {
  const normalizedEntries = normalizeStringList(value)
    .map((entry) => normalizeDomainEntry(entry))
    .filter((entry): entry is string => entry !== null);

  return [...new Set(normalizedEntries)];
}

export function normalizeSyncStorageState(value: unknown): NormalizedSyncStorageState {
  const syncStorageState = isRecord(value) ? value : {};

  return {
    enabled: normalizeEnabledState(syncStorageState.enabled),
    whitelist: normalizeWhitelist(syncStorageState.whitelist),
    selectorMap: normalizeSelectorMap(syncStorageState.selectorMap),
  };
}
