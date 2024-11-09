"use strict";
chrome.runtime.sendMessage({ action: "contentScriptReady" });
let isEnabled = true;
let whitelist = [];
function isWhitelisted(url) {
    const hostname = new URL(url).hostname;
    return whitelist.some((domain) => hostname.includes(domain));
}
const removeAds = (selectors) => {
    if (!isEnabled || isWhitelisted(window.location.href))
        return;
    selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => el.remove());
    });
};
const initAdBlocker = (selectors) => {
    if (!isEnabled || isWhitelisted(window.location.href))
        return;
    removeAds(selectors);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList")
                removeAds(selectors);
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
};
chrome.storage.sync.get(["selectors", "enabled", "whitelist"], (result) => {
    isEnabled = result.enabled !== false;
    whitelist = result.whitelist || [];
    if (result.selectors &&
        result.selectors.length > 0 &&
        isEnabled &&
        !isWhitelisted(window.location.href)) {
        initAdBlocker(result.selectors);
    }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleExtension") {
        isEnabled = message.enabled;
        if (isEnabled && !isWhitelisted(window.location.href)) {
            chrome.storage.sync.get(["selectors"], (result) => {
                if (result.selectors && result.selectors.length > 0) {
                    initAdBlocker(result.selectors);
                }
            });
        }
    }
    else if (message.action === "updateWhitelist") {
        whitelist = message.whitelist;
        if (isWhitelisted(window.location.href))
            location.reload();
        else if (isEnabled) {
            chrome.storage.sync.get(["selectors"], (result) => {
                if (result.selectors && result.selectors.length > 0) {
                    initAdBlocker(result.selectors);
                }
            });
        }
    }
});
