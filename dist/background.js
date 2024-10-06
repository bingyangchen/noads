"use strict";
const DEFAULT_AD_SELECTORS = [
    "#ad",
    "#ads",
    ".ad",
    ".ads",
    ".adsbygoogle",
    '[id^="ad-"]',
    '[class^="ad-"]',
    '[id^="ad_"]',
    '[class^="ad_"]',
    '[id^="ads-"]',
    '[class^="ads-"]',
    '[id^="ads_"]',
    '[class^="ads_"]',
    '[class*="-ads-"]',
    '[class*="_ads_"]',
    '[id*="-ads-"]',
    '[id*="_ads_"]',
    '[class$="_ads"]',
    '[class$="_ad"]',
    '[id$="_ads"]',
    '[id$="_ad"]',
    '[class$="-ads"]',
    '[class$="-ad"]',
    '[id$="-ads"]',
    '[id$="-ad"]',
    'iframe[src*="ads"]',
    'iframe[id*="ads"]',
    'iframe[class*="ads"]',
    '[class*="video-ad"]',
    '[id*="video-ad"]',
    '[class*="preroll"]',
    '[id*="preroll"]',
    'div[aria-label*="Advertisement"]',
    "div[data-ad-container]",
    '[class^="ad"]:not([class^="ad[a-z]"])',
    '[class^="ads"]:not([class^="ads[a-z]"])',
    ".Google-special",
];
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get(["selectors", "enabled"], (result) => {
        if (!result.selectors) {
            chrome.storage.sync.set({ selectors: DEFAULT_AD_SELECTORS });
        }
        if (result.enabled === undefined) {
            chrome.storage.sync.set({ enabled: true });
        }
    });
});
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 && chrome.tabs.executeScript) {
        // This indicates it's an iframe
        chrome.tabs.executeScript(details.tabId, {
            file: "content.js",
            frameId: details.frameId,
        });
    }
});
