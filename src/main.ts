import {
  getHostnameFromUrl,
  isUrlWhitelisted,
  normalizeDomainEntry,
  supportsDomainBasedRules,
} from "./domain";
import { createDefaultSelectorMap, mergeUniqueSelectors } from "./selectors";
import { normalizeSyncStorageState } from "./storage";
import type { SelectorMap } from "./types";

interface ActiveTabContext {
  url: string | null;
  hostname: string | null;
  supportsDomainRules: boolean;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseSelectorsInput(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

document.addEventListener("DOMContentLoaded", () => {
  const addForAllButton = document.getElementById("add-for-all") as HTMLButtonElement;
  const addForCurrentButton = document.getElementById(
    "add-for-current",
  ) as HTMLButtonElement;
  const status = document.getElementById("status") as HTMLParagraphElement;
  const selectorsTextarea = document.getElementById(
    "selectors-textarea",
  ) as HTMLTextAreaElement;
  const selectorTagsDiv = document.getElementById("selector-tags") as HTMLDivElement;
  const extensionToggle = document.getElementById(
    "extension-toggle",
  ) as HTMLInputElement;
  const whitelistInput = document.getElementById("whitelist-input") as HTMLInputElement;
  const addToWhitelistButton = document.getElementById(
    "add-to-whitelist",
  ) as HTMLButtonElement;
  const whitelistTagsDiv = document.getElementById("whitelist-tags") as HTMLDivElement;

  let selectorMap: SelectorMap = createDefaultSelectorMap();
  let whitelist: string[] = [];

  setStatus("Loading extension settings...");
  loadPopupState();

  extensionToggle.addEventListener("change", () => {
    const enabled = extensionToggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      if (!enabled) {
        refreshCurrentTab();
      }

      syncPopupWithActiveTab();
    });
  });

  addForAllButton.addEventListener("click", () => {
    const newSelectors = parseSelectorsInput(selectorsTextarea.value.trim());
    if (newSelectors.length === 0) {
      setStatus("Enter at least one selector.");
      return;
    }

    selectorMap.general = mergeUniqueSelectors(selectorMap.general, newSelectors);
    selectorsTextarea.value = "";
    saveSelectorMap("Selectors updated and saved.");
  });

  addForCurrentButton.addEventListener("click", () => {
    const newSelectors = parseSelectorsInput(selectorsTextarea.value.trim());
    if (newSelectors.length === 0) {
      setStatus("Enter at least one selector.");
      return;
    }

    withActiveTabContext((activeTabContext) => {
      if (!activeTabContext.supportsDomainRules || activeTabContext.hostname === null) {
        setStatus("Current-site selectors are only available on regular web pages.");
        return;
      }

      selectorMap[activeTabContext.hostname] = mergeUniqueSelectors(
        selectorMap[activeTabContext.hostname] ?? [],
        newSelectors,
      );
      selectorsTextarea.value = "";
      saveSelectorMap("Selectors updated and saved.");
    });
  });

  addToWhitelistButton.addEventListener("click", () => {
    const normalizedDomain = normalizeDomainEntry(whitelistInput.value);
    if (normalizedDomain === null) {
      setStatus("Enter a valid domain or URL.");
      return;
    }

    addToWhitelist(normalizedDomain);
    whitelistInput.value = "";
  });

  whitelistInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addToWhitelistButton.click();
    }
  });

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function withActiveTabContext(
    callback: (activeTabContext: ActiveTabContext) => void,
  ): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const tabUrl = activeTab?.url ?? null;

      callback({
        url: tabUrl,
        hostname: tabUrl === null ? null : getHostnameFromUrl(tabUrl),
        supportsDomainRules: tabUrl === null ? false : supportsDomainBasedRules(tabUrl),
      });
    });
  }

  function loadPopupState(): void {
    chrome.storage.sync.get(["selectorMap", "enabled", "whitelist"], (result) => {
      const syncStorageState = normalizeSyncStorageState(result);
      selectorMap = syncStorageState.selectorMap;
      whitelist = syncStorageState.whitelist;
      extensionToggle.checked = syncStorageState.enabled;

      if (result.selectorMap === undefined) {
        chrome.storage.sync.set({ selectorMap });
      }

      updateWhitelistTags();
      syncPopupWithActiveTab();
    });
  }

  function syncPopupWithActiveTab(): void {
    withActiveTabContext((activeTabContext) => {
      updateSelectorTags(activeTabContext.hostname);
      updateStatus(activeTabContext);
      addForCurrentButton.disabled = !activeTabContext.supportsDomainRules;
    });
  }

  function updateStatus(activeTabContext: ActiveTabContext): void {
    if (!extensionToggle.checked) {
      setStatus("Extension disabled.");
      return;
    }

    if (
      activeTabContext.url !== null &&
      isUrlWhitelisted(activeTabContext.url, whitelist)
    ) {
      setStatus("Extension enabled. Current site is whitelisted.");
      return;
    }

    if (!activeTabContext.supportsDomainRules) {
      setStatus(
        "Extension enabled. Current page does not support site-specific rules.",
      );
      return;
    }

    setStatus("Extension enabled.");
  }

  function updateSelectorTags(currentHostname: string | null): void {
    const visibleHostnames =
      currentHostname === null ? ["general"] : ["general", currentHostname];

    selectorTagsDiv.innerHTML = Object.entries(selectorMap)
      .filter(([hostname]) => visibleHostnames.includes(hostname))
      .map(([hostname, selectors]) => {
        return selectors
          .map((selector) => {
            const label =
              hostname === "general" ? selector : `{${hostname}} ${selector}`;

            return `<span class="tag">${escapeHtml(label)}
                      <div class="remove-button"
                          data-domain="${encodeURIComponent(hostname)}"
                          data-selector="${encodeURIComponent(selector)}">×</div></span>`;
          })
          .join("");
      })
      .join("");

    selectorTagsDiv.querySelectorAll(".remove-button").forEach((button) => {
      button.addEventListener("click", (event: Event) => {
        const target = event.currentTarget as HTMLDivElement;
        const encodedHostname = target.getAttribute("data-domain");
        const encodedSelector = target.getAttribute("data-selector");

        if (encodedHostname === null || encodedSelector === null) {
          return;
        }

        const hostname = decodeURIComponent(encodedHostname);
        const selectorToRemove = decodeURIComponent(encodedSelector);

        if (!selectorMap[hostname]) {
          return;
        }

        selectorMap[hostname] = selectorMap[hostname].filter(
          (selector) => selector !== selectorToRemove,
        );

        if (hostname !== "general" && selectorMap[hostname].length === 0) {
          delete selectorMap[hostname];
        }

        saveSelectorMap("Selectors updated and saved.");
      });
    });
  }

  function saveSelectorMap(message: string): void {
    chrome.storage.sync.set({ selectorMap }, () => {
      setStatus(message);
      syncPopupWithActiveTab();
      refreshCurrentTab();
    });
  }

  function refreshCurrentTab(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (activeTabId !== undefined) {
        chrome.tabs.reload(activeTabId, undefined, () => {
          void chrome.runtime.lastError;
        });
      }
    });
  }

  function updateWhitelistTags(): void {
    whitelistTagsDiv.innerHTML = whitelist
      .map((domain) => {
        return `<span class="tag">${escapeHtml(domain)} <div class="remove-button" data-domain="${encodeURIComponent(domain)}">×</div></span>`;
      })
      .join("");

    whitelistTagsDiv.querySelectorAll(".remove-button").forEach((button) => {
      button.addEventListener("click", (event: Event) => {
        const encodedDomain = (event.currentTarget as HTMLDivElement).getAttribute(
          "data-domain",
        );
        if (encodedDomain === null) {
          return;
        }

        removeFromWhitelist(decodeURIComponent(encodedDomain));
      });
    });
  }

  function saveWhitelist(message: string): void {
    chrome.storage.sync.set({ whitelist }, () => {
      updateWhitelistTags();
      setStatus(message);
      syncPopupWithActiveTab();
    });
  }

  function addToWhitelist(domain: string): void {
    const alreadyWhitelisted = whitelist.some((entry) => entry === domain);
    if (alreadyWhitelisted) {
      setStatus("That domain is already whitelisted.");
      return;
    }

    whitelist = [...whitelist, domain];
    saveWhitelist("Whitelist updated and saved.");
  }

  function removeFromWhitelist(domain: string): void {
    whitelist = whitelist.filter((entry) => entry !== domain);
    saveWhitelist("Whitelist updated and saved.");
  }
});
