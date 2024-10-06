"use strict";
const removeAds = (selectors) => {
    selectors.forEach((selector) => {
        document
            .querySelectorAll(selector)
            .forEach((element) => element.remove());
    });
};
const initAdBlocker = (selectors) => {
    removeAds(selectors);
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList")
                removeAds(selectors);
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
};
chrome.storage.sync.get(["selectors"], function (result) {
    if (result.selectors && result.selectors.length > 0) {
        initAdBlocker(result.selectors);
    }
});
