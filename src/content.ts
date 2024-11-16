chrome.runtime.sendMessage({ action: "contentScriptReady" });

let isEnabled = true;
let whitelist: string[] = [];
let selectorMap: { general: string[]; [domain: string]: string[] } = {
    general: [],
};

function isWhitelisted(url: string): boolean {
    const hostname = new URL(url).hostname;
    return whitelist.some((domain) => hostname.includes(domain));
}

const removeAds = (): void => {
    if (!isEnabled || isWhitelisted(window.location.href)) return;
    const hostname = window.location.hostname;
    const applicableSelectors = [
        ...selectorMap.general,
        ...(selectorMap[hostname] || []),
    ];
    applicableSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => el.remove());
    });
};

const initAdBlocker = (): void => {
    if (!isEnabled || isWhitelisted(window.location.href)) return;
    removeAds();
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList") removeAds();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
};

chrome.storage.sync.get(["selectorMap", "enabled", "whitelist"], (result) => {
    isEnabled = result.enabled !== false;
    whitelist = result.whitelist || [];
    selectorMap = result.selectorMap || { general: [] };
    if (isEnabled && !isWhitelisted(window.location.href)) initAdBlocker();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleExtension") {
        isEnabled = message.enabled;
        if (isEnabled && !isWhitelisted(window.location.href)) {
            initAdBlocker();
        }
    } else if (message.action === "updateWhitelist") {
        whitelist = message.whitelist;
        if (isWhitelisted(window.location.href)) location.reload();
        else if (isEnabled) initAdBlocker();
    }
});
