const DEFAULT_AD_SELECTORS = [
    ".ad",
    ".ads",
    ".adsbygoogle",
    '[id^="google_ads_"]',
    '[id^="ad-"]',
    '[class^="ad-"]',
    '[id^="banner-ad"]',
    '[class^="banner-ad"]',
    'iframe[src*="ads"]',
    'iframe[id*="ads"]',
    'iframe[class*="ads"]',
    '[class*="video-ad"]',
    '[id*="video-ad"]',
    '[class*="preroll"]',
    '[id*="preroll"]',
    'div[aria-label*="Advertisement"]',
    "div[data-ad-container]",
    'div[id^="google_ads_iframe_"]',
    'div[id^="div-gpt-ad"]',
];

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(["selectors"], function (result) {
        if (!result.selectors) {
            chrome.storage.sync.set({ selectors: DEFAULT_AD_SELECTORS });
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
        chrome.storage.sync.get(["selectors"], function (result) {
            if (result.selectors && result.selectors.length > 0) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: initAdBlocker,
                    args: [result.selectors],
                });
            }
        });
    }
});

function initAdBlocker(selectors: string[]): void {
    function removeAds() {
        selectors.forEach((selector) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element) => {
                element.remove();
            });
        });
    }

    removeAds();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList") {
                removeAds();
            }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
