"use strict";
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
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 && chrome.tabs.executeScript) {
        // This indicates it's an iframe
        chrome.tabs.executeScript(details.tabId, {
            file: "content.js",
            frameId: details.frameId,
        });
    }
});
