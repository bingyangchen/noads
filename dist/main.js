"use strict";
document.addEventListener("DOMContentLoaded", function () {
    const removeBtn = document.getElementById("removeBtn");
    const status = document.getElementById("status");
    const selectorsTextarea = document.getElementById("selectors");
    const selectorTagsDiv = document.getElementById("selectorTags");
    let allSelectors = [];
    chrome.storage.sync.get(["selectors"], function (result) {
        if (result.selectors) {
            allSelectors = result.selectors;
            updateSelectorTags();
        }
    });
    function updateSelectorTags() {
        selectorTagsDiv.innerHTML = allSelectors
            .map((selector) => `<span class="tag">${selector} <div class="remove-button" data-selector="${selector}">×</div></span>`)
            .join("");
        document.querySelectorAll(".remove-button").forEach((button) => {
            button.addEventListener("click", function () {
                const selectorToRemove = this.getAttribute("data-selector");
                if (selectorToRemove) {
                    allSelectors = allSelectors.filter((s) => s !== selectorToRemove);
                    updateSelectorTags();
                    saveSelectors();
                }
            });
        });
    }
    function saveSelectors() {
        chrome.storage.sync.set({ selectors: allSelectors }, function () {
            status.textContent = "Selectors updated and saved.";
        });
    }
    removeBtn.addEventListener("click", () => {
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
        // Refresh the current tab to apply new selectors
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0].id) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    });
});
