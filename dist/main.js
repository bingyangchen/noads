"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const addButton = document.getElementById("add-button");
    const status = document.getElementById("status");
    const selectorsTextarea = document.getElementById("selectors");
    const selectorTagsDiv = document.getElementById("selector-tags");
    const extensionToggle = document.getElementById("extension-toggle");
    const whitelistInput = document.getElementById("whitelist-input");
    const addToWhitelistButton = document.getElementById("add-to-whitelist");
    const whitelistTagsDiv = document.getElementById("whitelist-tags");
    status.textContent = "Extension loaded. Ready to block ads.";
    let allSelectors = [];
    chrome.storage.sync.get(["selectors"], (result) => {
        if (result.selectors) {
            allSelectors = result.selectors;
            updateSelectorTags();
        }
    });
    chrome.storage.sync.get(["enabled"], (result) => {
        extensionToggle.checked = result.enabled !== false;
        status.textContent = extensionToggle.checked
            ? "Extension enabled."
            : "Extension disabled.";
    });
    let whitelist = [];
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
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "toggleExtension",
                        enabled: enabled,
                    }, (response) => {
                        if (chrome.runtime.lastError || !enabled) {
                            refreshCurrentTab();
                        }
                    });
                }
            });
        });
    });
    function updateSelectorTags() {
        selectorTagsDiv.innerHTML = allSelectors
            .map((selector) => {
            const escapedSelector = selector.replace(/"/g, "&quot;");
            return `<span class="tag">${escapeHtml(selector)} <div class="remove-button" data-selector="${escapedSelector}">×</div></span>`;
        })
            .join("");
        document.querySelectorAll(".remove-button").forEach((button) => {
            button.addEventListener("click", (e) => {
                const selectorToRemove = e.currentTarget.getAttribute("data-selector");
                if (selectorToRemove) {
                    const unescapedSelector = selectorToRemove.replace(/&quot;/g, '"');
                    allSelectors = allSelectors.filter((s) => s !== unescapedSelector);
                    updateSelectorTags();
                    saveSelectors();
                    refreshCurrentTab();
                }
            });
        });
    }
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function saveSelectors() {
        chrome.storage.sync.set({ selectors: allSelectors }, () => {
            status.textContent = "Selectors updated and saved.";
        });
    }
    function refreshCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id)
                chrome.tabs.reload(tabs[0].id);
        });
    }
    addButton.addEventListener("click", () => {
        const selectorsText = selectorsTextarea.value.trim();
        const newSelectors = selectorsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        if (newSelectors.length === 0)
            return;
        allSelectors = [...new Set([...allSelectors, ...newSelectors])];
        updateSelectorTags();
        saveSelectors();
        selectorsTextarea.value = "";
        refreshCurrentTab();
    });
    function isWhitelisted(url) {
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
            button.addEventListener("click", (e) => {
                const domainToRemove = e.currentTarget.getAttribute("data-domain");
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
    function addToWhitelist(domain) {
        if (!whitelist.includes(domain)) {
            whitelist.push(domain);
            saveWhitelist();
            updateWhitelistTags();
        }
    }
    function removeFromWhitelist(domain) {
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
