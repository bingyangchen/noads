"use strict";
document.addEventListener("DOMContentLoaded", function () {
    const addButton = document.getElementById("add-button");
    const status = document.getElementById("status");
    const selectorsTextarea = document.getElementById("selectors");
    const selectorTagsDiv = document.getElementById("selector-tags");
    let allSelectors = [];
    chrome.storage.sync.get(["selectors"], function (result) {
        if (result.selectors) {
            allSelectors = result.selectors;
            updateSelectorTags();
        }
    });
    function updateSelectorTags() {
        selectorTagsDiv.innerHTML = allSelectors
            .map((selector) => {
            const escapedSelector = selector.replace(/"/g, "&quot;");
            return `<span class="tag">${escapeHtml(selector)} <div class="remove-button" data-selector="${escapedSelector}">×</div></span>`;
        })
            .join("");
        document.querySelectorAll(".remove-button").forEach((button) => {
            button.addEventListener("click", function () {
                const selectorToRemove = this.getAttribute("data-selector");
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
    // Add this helper function at the end of the file
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function saveSelectors() {
        chrome.storage.sync.set({ selectors: allSelectors }, function () {
            status.textContent = "Selectors updated and saved.";
        });
    }
    function refreshCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0].id) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    }
    addButton.addEventListener("click", () => {
        const selectorsText = selectorsTextarea.value.trim();
        const newSelectors = selectorsText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        if (newSelectors.length === 0) {
            status.textContent = "Please enter at least one CSS selector.";
            return;
        }
        allSelectors = [...new Set([...allSelectors, ...newSelectors])];
        updateSelectorTags();
        saveSelectors();
        selectorsTextarea.value = "";
        refreshCurrentTab();
    });
});
