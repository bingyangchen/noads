interface SelectorMap {
    general: string[];
    [domain: string]: string[];
}

document.addEventListener("DOMContentLoaded", () => {
    const addForAllButton = document.getElementById(
        "add-for-all"
    ) as HTMLButtonElement;
    const addForCurrentButton = document.getElementById(
        "add-for-current"
    ) as HTMLButtonElement;
    const status = document.getElementById("status") as HTMLParagraphElement;
    const selectorsTextarea = document.getElementById(
        "selectors-textarea"
    ) as HTMLTextAreaElement;
    const selectorTagsDiv = document.getElementById(
        "selector-tags"
    ) as HTMLDivElement;
    const extensionToggle = document.getElementById(
        "extension-toggle"
    ) as HTMLInputElement;
    const whitelistInput = document.getElementById(
        "whitelist-input"
    ) as HTMLInputElement;
    const addToWhitelistButton = document.getElementById(
        "add-to-whitelist"
    ) as HTMLButtonElement;
    const whitelistTagsDiv = document.getElementById(
        "whitelist-tags"
    ) as HTMLDivElement;

    status.textContent = "Extension loaded. Ready to block ads.";

    let selectorMap: SelectorMap = { general: [] };
    chrome.storage.sync.get(["selectorMap"], (result) => {
        if (result.selectorMap) {
            selectorMap = result.selectorMap;
            updateSelectorTags();
        } else chrome.storage.sync.set({ selectorMap: selectorMap });
    });

    chrome.storage.sync.get(["enabled"], (result) => {
        extensionToggle.checked = result.enabled !== false;
        status.textContent = extensionToggle.checked
            ? "Extension enabled."
            : "Extension disabled.";
    });

    let whitelist: string[] = [];
    chrome.storage.sync.get(["whitelist"], (result) => {
        if (result.whitelist) {
            whitelist = result.whitelist;
            updateWhitelistTags();
        }
    });

    extensionToggle.addEventListener("change", () => {
        const enabled = extensionToggle.checked;
        chrome.storage.sync.set({ enabled: enabled }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0].id && tabs[0].url) {
                    if (isWhitelisted(tabs[0].url)) {
                        status.textContent =
                            "Extension disabled for this whitelisted domain.";
                        extensionToggle.checked = false;
                        return;
                    }
                    status.textContent = enabled
                        ? "Extension enabled."
                        : "Extension disabled.";
                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        {
                            action: "toggleExtension",
                            enabled: enabled,
                        },
                        (response) => {
                            if (chrome.runtime.lastError || !enabled) {
                                refreshCurrentTab();
                            }
                        }
                    );
                }
            });
        });
    });

    function updateSelectorTags() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0].url) return;
            const allTags = Object.entries(selectorMap)
                .filter(([domain]) => {
                    return ["general", new URL(tabs[0].url!).hostname].includes(
                        domain
                    );
                })
                .map(([domain, selectors]) => {
                    return selectors
                        .map((selector) => {
                            const escapedSelector = selector.replace(
                                /"/g,
                                "&quot;"
                            );
                            const label =
                                domain === "general"
                                    ? `${selector}`
                                    : `{${domain}} ${selector}`;
                            return `<span class="tag">${escapeHtml(label)} 
                        <div class="remove-button" 
                            data-domain="${domain}" 
                            data-selector="${escapedSelector}">×</div></span>`;
                        })
                        .join("");
                })
                .join("");
            selectorTagsDiv.innerHTML = allTags;
            document.querySelectorAll(".remove-button").forEach((button) => {
                button.addEventListener("click", (e: Event) => {
                    const target = e.currentTarget as HTMLButtonElement;
                    const domain = target.getAttribute("data-domain");
                    const selectorToRemove =
                        target.getAttribute("data-selector");
                    if (domain && selectorToRemove) {
                        const unescapedSelector = selectorToRemove.replace(
                            /&quot;/g,
                            '"'
                        );
                        selectorMap[domain] = selectorMap[domain].filter(
                            (s) => s !== unescapedSelector
                        );
                        if (
                            domain !== "general" &&
                            selectorMap[domain].length === 0
                        ) {
                            delete selectorMap[domain];
                        }
                        updateSelectorTags();
                        saveSelectorMap();
                        refreshCurrentTab();
                    }
                });
            });
        });
    }

    function escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function saveSelectorMap() {
        chrome.storage.sync.set({ selectorMap: selectorMap }, () => {
            status.textContent = "Selectors updated and saved.";
        });
    }

    function refreshCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) chrome.tabs.reload(tabs[0].id);
        });
    }

    addForAllButton.addEventListener("click", () => {
        const selectorsText = selectorsTextarea.value.trim();
        const newSelectors = selectorsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        if (newSelectors.length === 0) return;
        selectorMap.general = [
            ...new Set([...selectorMap.general, ...newSelectors]),
        ];
        updateSelectorTags();
        saveSelectorMap();
        selectorsTextarea.value = "";
        refreshCurrentTab();
    });

    addForCurrentButton.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0].url) return;
            const hostname = new URL(tabs[0].url).hostname;
            const selectorsText = selectorsTextarea.value.trim();
            const newSelectors = selectorsText
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
            if (newSelectors.length === 0) return;
            if (!selectorMap[hostname]) selectorMap[hostname] = [];
            selectorMap[hostname] = [
                ...new Set([...selectorMap[hostname], ...newSelectors]),
            ];
            updateSelectorTags();
            saveSelectorMap();
            selectorsTextarea.value = "";
            refreshCurrentTab();
        });
    });

    function isWhitelisted(url: string): boolean {
        const hostname = new URL(url).hostname;
        return whitelist.some((domain) => hostname.includes(domain));
    }

    function updateWhitelistTags() {
        whitelistTagsDiv.innerHTML = whitelist
            .map((domain) => {
                const escapedDomain = escapeHtml(domain);
                return `<span class="tag">${escapedDomain} <div class="remove-button" data-domain="${escapedDomain}">×</div></span>`;
            })
            .join("");
        document
            .querySelectorAll("#whitelist-tags .remove-button")
            .forEach((button) => {
                button.addEventListener("click", (e: Event) => {
                    const domainToRemove = (
                        e.currentTarget as HTMLButtonElement
                    ).getAttribute("data-domain");
                    if (domainToRemove) {
                        removeFromWhitelist(domainToRemove);
                        updateWhitelistTags();
                        refreshCurrentTab();
                    }
                });
            });
    }

    function saveWhitelist() {
        chrome.storage.sync.set({ whitelist: whitelist }, () => {
            status.textContent = "Whitelist updated and saved.";
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "updateWhitelist",
                        whitelist: whitelist,
                    });
                }
            });
        });
    }

    function addToWhitelist(domain: string) {
        if (!whitelist.includes(domain)) {
            whitelist.push(domain);
            saveWhitelist();
            updateWhitelistTags();
        }
    }

    function removeFromWhitelist(domain: string) {
        whitelist = whitelist.filter((d) => d !== domain);
        saveWhitelist();
    }

    addToWhitelistButton.addEventListener("click", () => {
        const domain = whitelistInput.value.trim();
        if (domain) {
            addToWhitelist(domain);
            whitelistInput.value = "";
            refreshCurrentTab();
        }
    });
});
