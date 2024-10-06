document.addEventListener("DOMContentLoaded", () => {
    const addButton = document.getElementById(
        "add-button"
    ) as HTMLButtonElement;
    const status = document.getElementById("status") as HTMLParagraphElement;
    const selectorsTextarea = document.getElementById(
        "selectors"
    ) as HTMLTextAreaElement;
    const selectorTagsDiv = document.getElementById(
        "selector-tags"
    ) as HTMLDivElement;
    const extensionToggle = document.getElementById(
        "extension-toggle"
    ) as HTMLInputElement;

    status.textContent = "Extension loaded. Ready to block ads.";

    let allSelectors: string[] = [];
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

    extensionToggle.addEventListener("change", () => {
        const enabled = extensionToggle.checked;
        chrome.storage.sync.set({ enabled: enabled }, () => {
            status.textContent = enabled
                ? "Extension enabled."
                : "Extension disabled.";
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0].id) {
                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        {
                            action: "toggleExtension",
                            enabled: enabled,
                        },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                // The content script might not be loaded yet, so we'll refresh the tab
                                refreshCurrentTab();
                            } else if (!enabled) refreshCurrentTab();
                        }
                    );
                }
            });
        });
    });

    function updateSelectorTags() {
        selectorTagsDiv.innerHTML = allSelectors
            .map((selector) => {
                const escapedSelector = selector.replace(/"/g, "&quot;");
                return `<span class="tag">${escapeHtml(
                    selector
                )} <div class="remove-button" data-selector="${escapedSelector}">×</div></span>`;
            })
            .join("");
        document.querySelectorAll(".remove-button").forEach((button) => {
            button.addEventListener(
                "click",
                function (this: HTMLButtonElement) {
                    const selectorToRemove = this.getAttribute("data-selector");
                    if (selectorToRemove) {
                        const unescapedSelector = selectorToRemove.replace(
                            /&quot;/g,
                            '"'
                        );
                        allSelectors = allSelectors.filter(
                            (s) => s !== unescapedSelector
                        );
                        updateSelectorTags();
                        saveSelectors();
                        refreshCurrentTab();
                    }
                }
            );
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

    function saveSelectors() {
        chrome.storage.sync.set({ selectors: allSelectors }, () => {
            status.textContent = "Selectors updated and saved.";
        });
    }
    function refreshCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
