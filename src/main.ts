import {
  getActiveTab,
  getSyncStorageState,
  reloadTab,
  setSyncStorageState,
} from "./browser";
import {
  getHostnameFromUrl,
  isUrlWhitelisted,
  normalizeDomainEntry,
  supportsDomainBasedRules,
} from "./domain";
import { createDefaultSelectorMap, mergeUniqueSelectors } from "./selectors";
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

function getInvalidSelectors(selectors: readonly string[]): string[] {
  const selectorValidationRoot = document.createDocumentFragment();

  return selectors.filter((selector) => {
    try {
      selectorValidationRoot.querySelector(selector);
      return false;
    } catch {
      return true;
    }
  });
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
  void runPopupAction(loadPopupState, "Failed to load extension settings.");

  extensionToggle.addEventListener("change", () => {
    void runPopupAction(
      handleExtensionToggleChange,
      "Failed to update extension state.",
    );
  });

  addForAllButton.addEventListener("click", () => {
    void runPopupAction(addSelectorsForAllSites, "Failed to update selectors.");
  });

  addForCurrentButton.addEventListener("click", () => {
    void runPopupAction(addSelectorsForCurrentSite, "Failed to update selectors.");
  });

  addToWhitelistButton.addEventListener("click", () => {
    void runPopupAction(async () => {
      const normalizedDomain = normalizeDomainEntry(whitelistInput.value);
      if (normalizedDomain === null) {
        setStatus("Enter a valid domain or URL.");
        return;
      }

      await addToWhitelist(normalizedDomain);
      whitelistInput.value = "";
    }, "Failed to update whitelist.");
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

  function getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.length > 0) {
      return `${fallbackMessage} ${error.message}`;
    }

    return fallbackMessage;
  }

  async function runPopupAction(
    action: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      console.error(fallbackMessage, error);
      setStatus(getErrorMessage(error, fallbackMessage));
    }
  }

  async function getActiveTabContext(): Promise<ActiveTabContext> {
    const activeTab = await getActiveTab();
    const tabUrl = activeTab?.url ?? null;
    return {
      url: tabUrl,
      hostname: tabUrl === null ? null : getHostnameFromUrl(tabUrl),
      supportsDomainRules: tabUrl === null ? false : supportsDomainBasedRules(tabUrl),
    };
  }

  async function loadPopupState(): Promise<void> {
    const syncStorageState = await getSyncStorageState();
    selectorMap = syncStorageState.selectorMap;
    whitelist = syncStorageState.whitelist;
    extensionToggle.checked = syncStorageState.enabled;

    updateWhitelistTags();
    await syncPopupWithActiveTab();
  }

  async function syncPopupWithActiveTab(): Promise<void> {
    const activeTabContext = await getActiveTabContext();
    updateSelectorTags(activeTabContext.hostname);
    updateStatus(activeTabContext);
    addForCurrentButton.disabled = !activeTabContext.supportsDomainRules;
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
        void runPopupAction(async () => {
          const target = event.currentTarget as HTMLDivElement;
          const encodedHostname = target.getAttribute("data-domain");
          const encodedSelector = target.getAttribute("data-selector");

          if (encodedHostname === null || encodedSelector === null) {
            return;
          }

          const hostname = decodeURIComponent(encodedHostname);
          const selectorToRemove = decodeURIComponent(encodedSelector);
          const existingSelectors = selectorMap[hostname];

          if (!existingSelectors) {
            return;
          }

          const nextSelectors = existingSelectors.filter(
            (selector) => selector !== selectorToRemove,
          );
          const nextSelectorMap: SelectorMap = {
            ...selectorMap,
            [hostname]: nextSelectors,
          };

          if (hostname !== "general" && nextSelectors.length === 0) {
            delete nextSelectorMap[hostname];
          }

          await saveSelectorMap(nextSelectorMap, "Selectors updated and saved.");
        }, "Failed to update selectors.");
      });
    });
  }

  async function saveSelectorMap(
    nextSelectorMap: SelectorMap,
    message: string,
  ): Promise<void> {
    await setSyncStorageState({ selectorMap: nextSelectorMap });
    selectorMap = nextSelectorMap;
    setStatus(message);
    await syncPopupWithActiveTab();
    await refreshCurrentTab();
  }

  async function refreshCurrentTab(): Promise<void> {
    const activeTab = await getActiveTab();
    if (activeTab?.id !== undefined) {
      await reloadTab(activeTab.id);
    }
  }

  function getSubmittedSelectors(): string[] | null {
    const submittedSelectors = parseSelectorsInput(selectorsTextarea.value);
    if (submittedSelectors.length === 0) {
      setStatus("Enter at least one selector.");
      return null;
    }

    const invalidSelectors = getInvalidSelectors(submittedSelectors);
    if (invalidSelectors.length > 0) {
      const firstInvalidSelector = invalidSelectors[0];
      const remainingInvalidCount = invalidSelectors.length - 1;
      const additionalInvalidSelectorsMessage =
        remainingInvalidCount > 0 ? ` (+${remainingInvalidCount} more)` : "";
      setStatus(
        `Invalid CSS selector: ${firstInvalidSelector}${additionalInvalidSelectorsMessage}`,
      );
      return null;
    }

    return submittedSelectors;
  }

  function updateWhitelistTags(): void {
    whitelistTagsDiv.innerHTML = whitelist
      .map((domain) => {
        return `<span class="tag">${escapeHtml(domain)} <div class="remove-button" data-domain="${encodeURIComponent(domain)}">×</div></span>`;
      })
      .join("");

    whitelistTagsDiv.querySelectorAll(".remove-button").forEach((button) => {
      button.addEventListener("click", (event: Event) => {
        void runPopupAction(async () => {
          const encodedDomain = (event.currentTarget as HTMLDivElement).getAttribute(
            "data-domain",
          );
          if (encodedDomain === null) {
            return;
          }

          await removeFromWhitelist(decodeURIComponent(encodedDomain));
        }, "Failed to update whitelist.");
      });
    });
  }

  async function saveWhitelist(
    nextWhitelist: string[],
    message: string,
  ): Promise<void> {
    await setSyncStorageState({ whitelist: nextWhitelist });
    whitelist = nextWhitelist;
    updateWhitelistTags();
    setStatus(message);
    await syncPopupWithActiveTab();
  }

  async function addToWhitelist(domain: string): Promise<void> {
    const alreadyWhitelisted = whitelist.some((entry) => entry === domain);
    if (alreadyWhitelisted) {
      setStatus("That domain is already whitelisted.");
      return;
    }

    const nextWhitelist = [...whitelist, domain];
    await saveWhitelist(nextWhitelist, "Whitelist updated and saved.");
  }

  async function removeFromWhitelist(domain: string): Promise<void> {
    const nextWhitelist = whitelist.filter((entry) => entry !== domain);
    await saveWhitelist(nextWhitelist, "Whitelist updated and saved.");
  }

  async function handleExtensionToggleChange(): Promise<void> {
    const enabled = extensionToggle.checked;
    await setSyncStorageState({ enabled });

    if (!enabled) {
      await refreshCurrentTab();
    }

    await syncPopupWithActiveTab();
  }

  async function addSelectorsForAllSites(): Promise<void> {
    const newSelectors = getSubmittedSelectors();
    if (newSelectors === null) {
      return;
    }

    const nextSelectorMap: SelectorMap = {
      ...selectorMap,
      general: mergeUniqueSelectors(selectorMap.general, newSelectors),
    };
    await saveSelectorMap(nextSelectorMap, "Selectors updated and saved.");
    selectorsTextarea.value = "";
  }

  async function addSelectorsForCurrentSite(): Promise<void> {
    const newSelectors = getSubmittedSelectors();
    if (newSelectors === null) {
      return;
    }

    const activeTabContext = await getActiveTabContext();
    if (!activeTabContext.supportsDomainRules || activeTabContext.hostname === null) {
      setStatus("Current-site selectors are only available on regular web pages.");
      return;
    }

    const nextSelectorMap: SelectorMap = {
      ...selectorMap,
      [activeTabContext.hostname]: mergeUniqueSelectors(
        selectorMap[activeTabContext.hostname] ?? [],
        newSelectors,
      ),
    };
    await saveSelectorMap(nextSelectorMap, "Selectors updated and saved.");
    selectorsTextarea.value = "";
  }
});
