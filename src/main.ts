import {
  getActiveTab,
  getSyncStorageState,
  reloadTab,
  setSyncStorageState,
} from "./browser";
import {
  getHostnameFromUrl,
  isHostnameWhitelisted,
  normalizeDomainEntry,
  supportsDomainBasedRules,
  supportsPageContentRules,
} from "./domain";
import type { RuntimeMessage, RuntimeMessageResponse } from "./messages";
import { getInvalidCssSelectors } from "./selectorValidation";
import { createDefaultSelectorMap, mergeUniqueSelectors } from "./selectors";
import type { SelectorMap } from "./types";

type View = "home" | "manage-rules" | "paused-sites";
type ManualScope = "this-site" | "all-sites";
type ManageScope = "this-site" | "all-sites";

type HeroStatus = "loading" | "active" | "paused" | "unavailable" | "error";

interface AppError {
  title: string;
  detail?: string;
  retryLabel?: string;
  retry?: () => void;
}

interface ActiveTabContext {
  tabId: number | null;
  url: string | null;
  hostname: string | null;
  supportsDomainRules: boolean;
  supportsContentRules: boolean;
}

interface AppState {
  view: View;
  previousView: View;
  ready: boolean;
  enabled: boolean;
  selectorMap: SelectorMap;
  pausedSites: string[];
  tab: ActiveTabContext;
  manualScope: ManualScope;
  manageScope: ManageScope;
  pausedSearch: string;
  manualExamplesOpen: boolean;
  manualInput: string;
  manualError: string | null;
  loadError: AppError | null;
}

const MANUAL_PREVIEW_LIMIT = 4;

const state: AppState = {
  view: "home",
  previousView: "home",
  ready: false,
  enabled: true,
  selectorMap: createDefaultSelectorMap(),
  pausedSites: [],
  tab: {
    tabId: null,
    url: null,
    hostname: null,
    supportsDomainRules: false,
    supportsContentRules: false,
  },
  manualScope: "this-site",
  manageScope: "this-site",
  pausedSearch: "",
  manualExamplesOpen: false,
  manualInput: "",
  manualError: null,
  loadError: null,
};

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element with id: ${id}`);
  }
  return element as T;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getActiveTabContextFromTab(tab: chrome.tabs.Tab | null): ActiveTabContext {
  const tabUrl = tab?.url ?? null;
  return {
    tabId: tab?.id ?? null,
    url: tabUrl,
    hostname: tabUrl === null ? null : getHostnameFromUrl(tabUrl),
    supportsDomainRules: tabUrl === null ? false : supportsDomainBasedRules(tabUrl),
    supportsContentRules: tabUrl === null ? false : supportsPageContentRules(tabUrl),
  };
}

function getHeroStatus(): HeroStatus {
  if (!state.ready) {
    return "loading";
  }
  if (state.loadError !== null) {
    return "error";
  }
  if (!state.tab.supportsContentRules) {
    return "unavailable";
  }
  if (
    state.tab.hostname !== null &&
    isHostnameWhitelisted(state.tab.hostname, state.pausedSites)
  ) {
    return "paused";
  }
  return "active";
}

interface ConfirmDialogOptions {
  title: string;
  description: string;
  hint?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  defaultFocus?: "confirm" | "cancel";
}

const rootElement = document.getElementById("app");
if (rootElement === null) {
  throw new Error("Missing #app root element");
}

const app = rootElement;
const globalToggle = getElement<HTMLButtonElement>("global-toggle");

const hero = getElement<HTMLElement>("status-hero");
const heroFavicon = getElement<HTMLSpanElement>("hero-favicon");
const heroHostname = getElement<HTMLSpanElement>("hero-hostname");
const heroBadge = getElement<HTMLSpanElement>("hero-badge");
const heroTitle = getElement<HTMLHeadingElement>("hero-title");
const heroDescription = getElement<HTMLParagraphElement>("hero-description");
const heroPrimaryAction = getElement<HTMLButtonElement>("hero-primary-action");
const heroSecondaryAction = getElement<HTMLButtonElement>("hero-secondary-action");

const manualScopeControl = getElement<HTMLDivElement>("manual-scope-control");
const manualScopeHint = getElement<HTMLParagraphElement>("manual-scope-hint");
const manualSelectors = getElement<HTMLTextAreaElement>("manual-selectors");
const manualShowExamples = getElement<HTMLButtonElement>("manual-show-examples");
const manualExamples = getElement<HTMLDivElement>("manual-examples");
const manualError = getElement<HTMLParagraphElement>("manual-error");
const manualSubmit = getElement<HTMLButtonElement>("manual-submit");

const rulesPreviewList = getElement<HTMLUListElement>("rules-preview-list");
const rulesPreviewOverflow = getElement<HTMLParagraphElement>("rules-preview-overflow");
const rulesPreviewEmpty = getElement<HTMLDivElement>("rules-preview-empty");
const rulesManageLink = getElement<HTMLButtonElement>("rules-manage-link");

const pausedSummaryCard = getElement<HTMLElement>("paused-summary-card");
const pausedSummaryTitle = getElement<HTMLParagraphElement>("paused-summary-title");
const pausedSummaryLink = getElement<HTMLButtonElement>("paused-summary-link");

const viewHome = getElement<HTMLElement>("view-home");
const viewManageRules = getElement<HTMLElement>("view-manage-rules");
const viewPausedSites = getElement<HTMLElement>("view-paused-sites");

const manageScopeControl = getElement<HTMLDivElement>("manage-scope");
const manageContent = getElement<HTMLDivElement>("manage-content");

const pausedSearch = getElement<HTMLInputElement>("paused-search");
const pausedList = getElement<HTMLUListElement>("paused-list");
const pausedEmpty = getElement<HTMLDivElement>("paused-empty");
const pausedEmptyTitle = getElement<HTMLParagraphElement>("paused-empty-title");
const pausedEmptyDescription = getElement<HTMLParagraphElement>(
  "paused-empty-description",
);
const pausedEmptyAction = getElement<HTMLButtonElement>("paused-empty-action");
const pausedAddInput = getElement<HTMLInputElement>("paused-add-input");
const pausedAddError = getElement<HTMLParagraphElement>("paused-add-error");
const pausedAddSubmit = getElement<HTMLButtonElement>("paused-add-submit");

const toastRegion = getElement<HTMLDivElement>("toast-region");
const dialogRoot = getElement<HTMLDivElement>("dialog-root");

function showToast(
  message: string,
  options?: { onUndo?: () => void; durationMs?: number },
): void {
  const toast = document.createElement("div");
  toast.className = "toast";

  const messageSpan = document.createElement("span");
  messageSpan.className = "toast-message";
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

  if (options?.onUndo) {
    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.className = "toast-undo";
    undoButton.textContent = "Undo";
    undoButton.addEventListener("click", () => {
      removeToast(toast);
      options.onUndo?.();
    });
    toast.appendChild(undoButton);
  }

  toastRegion.appendChild(toast);

  const duration = options?.durationMs ?? 2500;
  window.setTimeout(() => {
    removeToast(toast);
  }, duration);
}

function removeToast(toast: HTMLElement): void {
  if (!toast.isConnected) {
    return;
  }
  toast.classList.add("toast-out");
  window.setTimeout(() => {
    toast.remove();
  }, 220);
}

function openConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.className = "dialog-title";
    title.textContent = options.title;
    dialog.appendChild(title);

    const description = document.createElement("p");
    description.className = "dialog-description";
    description.textContent = options.description;
    dialog.appendChild(description);

    if (options.hint !== undefined) {
      const hintElement = document.createElement("p");
      hintElement.className = "dialog-hint";
      hintElement.textContent = options.hint;
      dialog.appendChild(hintElement);
    }

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "button button-ghost";
    cancelButton.textContent = options.cancelLabel ?? "Cancel";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = `button ${
      options.destructive === true ? "button-danger" : "button-primary"
    }`;
    confirmButton.textContent = options.confirmLabel;

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    dialog.appendChild(actions);

    dialogRoot.innerHTML = "";
    dialogRoot.appendChild(dialog);
    dialogRoot.hidden = false;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable: HTMLButtonElement[] = [cancelButton, confirmButton];
    const defaultFocus =
      options.defaultFocus ?? (options.destructive === true ? "cancel" : "confirm");
    const initiallyFocused = defaultFocus === "cancel" ? cancelButton : confirmButton;
    initiallyFocused.focus();

    function close(result: boolean): void {
      document.removeEventListener("keydown", handleKeyDown, true);
      dialogRoot.removeEventListener("click", handleBackdrop);
      dialogRoot.innerHTML = "";
      dialogRoot.hidden = true;
      if (previouslyFocused !== null && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
      resolve(result);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }

      if (event.key === "Tab") {
        const currentIndex = focusable.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const nextIndex = event.shiftKey
          ? currentIndex <= 0
            ? focusable.length - 1
            : currentIndex - 1
          : currentIndex === focusable.length - 1 || currentIndex === -1
            ? 0
            : currentIndex + 1;
        event.preventDefault();
        focusable[nextIndex].focus();
      }
    }

    function handleBackdrop(event: MouseEvent): void {
      if (event.target === dialogRoot) {
        close(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    dialogRoot.addEventListener("click", handleBackdrop);
    cancelButton.addEventListener("click", () => {
      close(false);
    });
    confirmButton.addEventListener("click", () => {
      close(true);
    });
  });
}

function setView(nextView: View): void {
  state.previousView = state.view;
  state.view = nextView;
  app.dataset.view = nextView;
  viewHome.hidden = nextView !== "home";
  viewManageRules.hidden = nextView !== "manage-rules";
  viewPausedSites.hidden = nextView !== "paused-sites";
  render();
}

function setGlobalToggleUi(enabled: boolean): void {
  globalToggle.setAttribute("aria-checked", String(enabled));
  globalToggle.setAttribute(
    "aria-label",
    enabled ? "Disable Noads everywhere" : "Enable Noads everywhere",
  );
}

function renderFavicon(): void {
  const { hostname, url } = state.tab;
  if (hostname === null || url === null || !state.tab.supportsContentRules) {
    heroFavicon.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
        <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" stroke="currentColor" stroke-width="1.4"/>
      </svg>`;
    return;
  }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  heroFavicon.innerHTML = `<img src="${escapeHtml(faviconUrl)}" alt="" />`;
}

function renderHero(): void {
  const status = getHeroStatus();
  hero.dataset.status = status;
  renderFavicon();

  if (status === "loading") {
    heroHostname.textContent = "";
    app.dataset.state = "loading";
    heroPrimaryAction.hidden = true;
    heroSecondaryAction.hidden = true;
    return;
  }

  app.dataset.state = "ready";
  heroPrimaryAction.hidden = false;
  heroSecondaryAction.hidden = false;

  heroHostname.textContent = state.tab.hostname ?? "This page";

  if (!state.enabled) {
    renderBadge("muted", "Off");
    heroTitle.textContent = "Protection is off everywhere";
    heroDescription.textContent =
      "Noads is disabled globally. Turn it back on to resume cleaning pages.";
    setPrimaryAction("Turn Noads on", () => {
      void runAction(async () => {
        await handleGlobalToggle(true);
      }, "Failed to update Noads.");
    });
    setSecondaryAction("Manage rules", () => {
      setView("manage-rules");
    });
    hero.dataset.status = "paused";
    return;
  }

  switch (status) {
    case "active":
      renderBadge("success", "Active");
      heroTitle.textContent = "This page is being cleaned";
      heroDescription.textContent =
        "Noads is active on this site. You can pause protection or remove more distractions.";
      setPrimaryAction("Pick something to hide", () => {
        void handleStartPicker();
      });
      setSecondaryAction("Pause on this site", () => {
        void runAction(handlePauseCurrentSite, "Failed to pause this site.");
      });
      if (!state.tab.supportsDomainRules) {
        heroPrimaryAction.disabled = false;
        heroSecondaryAction.disabled = true;
      } else {
        heroPrimaryAction.disabled = false;
        heroSecondaryAction.disabled = false;
      }
      break;
    case "paused":
      renderBadge("neutral", "Paused");
      heroTitle.textContent = "Protection is paused here";
      heroDescription.textContent =
        "This site is excluded, so Noads will not remove anything on this domain.";
      setPrimaryAction("Turn protection back on", () => {
        void runAction(handleResumeCurrentSite, "Failed to resume this site.");
      });
      setSecondaryAction("Manage paused sites", () => {
        setView("paused-sites");
      });
      break;
    case "unavailable":
      renderBadge("muted", "Unavailable");
      heroTitle.textContent = "This page cannot be modified";
      heroDescription.textContent = "Noads only works on supported web pages.";
      setPrimaryAction("Manage rules", () => {
        setView("manage-rules");
      });
      setSecondaryAction("Manage paused sites", () => {
        setView("paused-sites");
      });
      break;
    case "error": {
      const appError = state.loadError;
      renderBadge("danger", "Error");
      heroTitle.textContent = appError?.title ?? "We couldn't load your settings";
      heroDescription.textContent =
        appError?.detail ??
        "Please try again. If the problem continues, reopen the extension.";
      setPrimaryAction(appError?.retryLabel ?? "Try again", () => {
        const retry = appError?.retry;
        if (typeof retry === "function") {
          retry();
          return;
        }
        void loadInitialState();
      });
      setSecondaryAction("Manage rules", () => {
        setView("manage-rules");
      });
      break;
    }
    default:
      break;
  }
}

function renderBadge(
  tone: "success" | "neutral" | "muted" | "danger",
  label: string,
): void {
  heroBadge.className = `badge badge-${tone}`;
  heroBadge.innerHTML = `
    <span class="badge-dot" aria-hidden="true"></span>
    <span class="badge-label">${escapeHtml(label)}</span>
  `;
}

function setPrimaryAction(label: string, handler: () => void): void {
  heroPrimaryAction.textContent = label;
  heroPrimaryAction.disabled = false;
  heroPrimaryAction.onclick = (event) => {
    event.preventDefault();
    handler();
  };
}

function setSecondaryAction(label: string, handler: () => void): void {
  heroSecondaryAction.textContent = label;
  heroSecondaryAction.disabled = false;
  heroSecondaryAction.onclick = (event) => {
    event.preventDefault();
    handler();
  };
}

function renderManualScope(): void {
  const options = Array.from(
    manualScopeControl.querySelectorAll<HTMLButtonElement>(".segmented-option"),
  );
  options.forEach((option) => {
    const scope = option.dataset.scope as ManualScope;
    option.classList.toggle("is-active", scope === state.manualScope);
    option.setAttribute("aria-selected", String(scope === state.manualScope));

    if (scope === "this-site") {
      const disabled = !state.tab.supportsDomainRules;
      option.disabled = disabled;
      if (disabled) {
        option.setAttribute(
          "title",
          "This site cannot hold site-specific rules. Use All sites instead.",
        );
      } else {
        option.removeAttribute("title");
      }
    }
  });

  if (state.manualScope === "this-site" && !state.tab.supportsDomainRules) {
    state.manualScope = "all-sites";
    renderManualScope();
    return;
  }

  if (!state.tab.supportsDomainRules) {
    manualScopeHint.hidden = false;
    manualScopeHint.textContent =
      "Site-specific rules are only available on regular web pages.";
  } else {
    manualScopeHint.hidden = true;
    manualScopeHint.textContent = "";
  }
}

function renderManualError(): void {
  if (state.manualError === null) {
    manualError.hidden = true;
    manualError.textContent = "";
  } else {
    manualError.hidden = false;
    manualError.textContent = state.manualError;
  }
}

function renderManualExamples(): void {
  manualExamples.hidden = !state.manualExamplesOpen;
  manualShowExamples.textContent = state.manualExamplesOpen
    ? "Hide examples"
    : "Need help? Show examples";
}

function renderManualSubmitLabel(): void {
  const lines = parseSelectorLines(state.manualInput);
  if (lines.length > 1) {
    manualSubmit.textContent = `Add ${lines.length} rules`;
  } else {
    manualSubmit.textContent = "Add rule";
  }
}

interface RulePreviewEntry {
  selector: string;
  scope: "this-site" | "all-sites";
  hostname: string;
}

function getRulesAffectingCurrentPage(): RulePreviewEntry[] {
  const entries: RulePreviewEntry[] = [];
  const hostname = state.tab.hostname;
  if (hostname !== null) {
    const siteRules = state.selectorMap[hostname];
    if (Array.isArray(siteRules)) {
      siteRules.forEach((selector) => {
        entries.push({ selector, scope: "this-site", hostname });
      });
    }
  }
  state.selectorMap.general.forEach((selector) => {
    entries.push({ selector, scope: "all-sites", hostname: "general" });
  });
  return entries;
}

function renderRulesPreview(): void {
  const entries = getRulesAffectingCurrentPage();

  if (entries.length === 0) {
    rulesPreviewList.hidden = true;
    rulesPreviewOverflow.hidden = true;
    rulesPreviewEmpty.hidden = false;
    return;
  }

  rulesPreviewEmpty.hidden = true;
  rulesPreviewList.hidden = false;

  const visibleEntries = entries.slice(0, MANUAL_PREVIEW_LIMIT);
  const hiddenCount = entries.length - visibleEntries.length;

  rulesPreviewList.innerHTML = visibleEntries
    .map((entry) => renderRuleRow(entry))
    .join("");

  if (hiddenCount > 0) {
    rulesPreviewOverflow.hidden = false;
    rulesPreviewOverflow.textContent =
      hiddenCount === 1
        ? "1 more rule not shown"
        : `${hiddenCount} more rules not shown`;
  } else {
    rulesPreviewOverflow.hidden = true;
    rulesPreviewOverflow.textContent = "";
  }
}

function renderRuleRow(entry: RulePreviewEntry): string {
  const scopeLabel = entry.scope === "this-site" ? "This site" : "All sites";
  const scopeClass =
    entry.scope === "this-site" ? "scope-badge-site" : "scope-badge-all";
  return `
    <li class="rule-row" data-hostname="${escapeHtml(entry.hostname)}" data-selector="${escapeHtml(entry.selector)}">
      <span class="scope-badge ${scopeClass}">${scopeLabel}</span>
      <span class="rule-selector" title="${escapeHtml(entry.selector)}">${escapeHtml(entry.selector)}</span>
      <button type="button" class="rule-remove" data-action="remove" aria-label="Remove rule">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </li>
  `;
}

function renderPausedSummary(): void {
  const count = state.pausedSites.length;
  if (count === 0) {
    pausedSummaryCard.hidden = true;
    pausedSummaryTitle.textContent = "";
    return;
  }

  pausedSummaryCard.hidden = false;
  pausedSummaryTitle.textContent =
    count === 1 ? "Paused on 1 site" : `Paused on ${count} sites`;
}

function renderManageRules(): void {
  const options = Array.from(
    manageScopeControl.querySelectorAll<HTMLButtonElement>(".segmented-option"),
  );
  options.forEach((option) => {
    const scope = option.dataset.scope as ManageScope;
    option.classList.toggle("is-active", scope === state.manageScope);
    option.setAttribute("aria-selected", String(scope === state.manageScope));

    if (scope === "this-site") {
      const disabled = state.tab.hostname === null;
      option.disabled = disabled;
    }
  });

  if (state.manageScope === "this-site" && state.tab.hostname === null) {
    state.manageScope = "all-sites";
    renderManageRules();
    return;
  }

  const rules =
    state.manageScope === "all-sites"
      ? state.selectorMap.general.map((selector) => ({
          selector,
          scope: "all-sites" as const,
          hostname: "general",
        }))
      : (state.tab.hostname !== null
          ? (state.selectorMap[state.tab.hostname] ?? [])
          : []
        ).map((selector) => ({
          selector,
          scope: "this-site" as const,
          hostname: state.tab.hostname ?? "",
        }));

  if (rules.length === 0) {
    manageContent.innerHTML = `
      <div class="manage-empty">
        ${
          state.manageScope === "all-sites"
            ? "You haven't added any all-sites rules yet."
            : "No rules for this site yet."
        }
      </div>
    `;
    return;
  }

  const rowsHtml = rules
    .map(
      (rule) => `
        <li class="manage-row rule-row" data-hostname="${escapeHtml(rule.hostname)}" data-selector="${escapeHtml(rule.selector)}">
          <div class="rule-meta">
            <span class="rule-meta-selector" title="${escapeHtml(rule.selector)}">${escapeHtml(rule.selector)}</span>
            <span class="rule-meta-applies">${
              rule.scope === "all-sites"
                ? "Applies everywhere"
                : `Applies to ${escapeHtml(rule.hostname)}`
            }</span>
          </div>
          <button type="button" class="rule-remove" data-action="remove" aria-label="Remove rule">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </li>
      `,
    )
    .join("");

  const batchButton =
    state.manageScope === "this-site" && rules.length > 0
      ? `<div class="manage-batch"><button type="button" class="button button-ghost button-block" data-action="clear-site">Remove all rules for this site</button></div>`
      : "";

  manageContent.innerHTML = `
    <ul class="rule-list">${rowsHtml}</ul>
    ${batchButton}
  `;
}

function renderPausedView(): void {
  const rawQuery = state.pausedSearch.trim();
  const query = rawQuery.toLowerCase();
  const hasSearch = query.length > 0;
  const filtered = hasSearch
    ? state.pausedSites.filter((entry) => entry.toLowerCase().includes(query))
    : state.pausedSites;

  if (filtered.length === 0) {
    pausedList.hidden = true;
    pausedEmpty.hidden = false;

    if (state.pausedSites.length === 0) {
      pausedEmptyTitle.textContent = "No paused sites";
      pausedEmptyDescription.textContent = "Sites you pause will show up here.";
      pausedEmptyAction.hidden = true;
      pausedEmptyAction.textContent = "";
    } else {
      pausedEmptyTitle.textContent = `No matches for "${rawQuery}"`;
      pausedEmptyDescription.textContent =
        "Try a different term, or clear the search to see every paused site.";
      pausedEmptyAction.hidden = false;
      pausedEmptyAction.textContent = "Clear search";
    }
    return;
  }

  pausedEmpty.hidden = true;
  pausedEmptyAction.hidden = true;
  pausedList.hidden = false;
  pausedList.innerHTML = filtered
    .map(
      (hostname) => `
        <li class="paused-row" data-hostname="${escapeHtml(hostname)}">
          <div class="paused-row-text">
            <span class="paused-row-hostname">${escapeHtml(hostname)}</span>
            <span class="paused-row-description">Protection is off</span>
          </div>
          <button type="button" class="paused-row-action" data-action="resume">Resume</button>
        </li>
      `,
    )
    .join("");
}

function render(): void {
  setGlobalToggleUi(state.enabled);
  renderHero();

  if (state.view === "home") {
    renderManualScope();
    renderManualError();
    renderManualExamples();
    renderManualSubmitLabel();
    renderRulesPreview();
    renderPausedSummary();
  } else if (state.view === "manage-rules") {
    renderManageRules();
  } else if (state.view === "paused-sites") {
    renderPausedView();
  }
}

function parseSelectorLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function showErrorToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast toast-error";

  const messageSpan = document.createElement("span");
  messageSpan.className = "toast-message";
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

  toastRegion.appendChild(toast);

  window.setTimeout(() => {
    removeToast(toast);
  }, 3200);
}

async function runAction(
  action: () => Promise<void>,
  fallbackMessage: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(fallbackMessage, error);
    showErrorToast(fallbackMessage);
  }
}

async function refreshCurrentTabIfNeeded(): Promise<void> {
  if (state.tab.tabId !== null && state.tab.supportsContentRules) {
    try {
      await reloadTab(state.tab.tabId);
    } catch (error) {
      console.warn("Failed to reload tab after change.", error);
    }
  }
}

async function persistSelectorMap(nextSelectorMap: SelectorMap): Promise<void> {
  await setSyncStorageState({ selectorMap: nextSelectorMap });
  state.selectorMap = nextSelectorMap;
}

async function persistPausedSites(nextPausedSites: string[]): Promise<void> {
  await setSyncStorageState({ whitelist: nextPausedSites });
  state.pausedSites = nextPausedSites;
}

async function persistEnabled(enabled: boolean): Promise<void> {
  await setSyncStorageState({ enabled });
  state.enabled = enabled;
}

async function handleGlobalToggle(nextEnabled: boolean): Promise<void> {
  await persistEnabled(nextEnabled);
  render();
  if (!nextEnabled) {
    await refreshCurrentTabIfNeeded();
  }
}

async function handlePauseCurrentSite(): Promise<void> {
  if (state.tab.hostname === null) {
    return;
  }
  const hostname = state.tab.hostname;
  const nextPausedSites = Array.from(new Set([...state.pausedSites, hostname]));
  const previous = state.pausedSites;
  await persistPausedSites(nextPausedSites);
  render();

  showToast(`Protection paused on ${hostname}`, {
    onUndo: () => {
      void runAction(async () => {
        await persistPausedSites(previous);
        render();
      }, "Failed to undo pause.");
    },
  });
}

async function handleResumeCurrentSite(): Promise<void> {
  if (state.tab.hostname === null) {
    return;
  }
  const hostname = state.tab.hostname;
  const previous = state.pausedSites;
  const nextPausedSites = state.pausedSites.filter((entry) => entry !== hostname);

  if (isHostnameWhitelisted(hostname, nextPausedSites)) {
    const parentEntry = nextPausedSites.find((entry) => hostname.endsWith(`.${entry}`));
    showErrorToast(
      parentEntry !== undefined
        ? `This site is paused via ${parentEntry}. Open Paused sites to manage it.`
        : "This site is paused by another entry. Open Paused sites to manage it.",
    );
    return;
  }

  await persistPausedSites(nextPausedSites);
  render();

  showToast(`Protection turned back on for ${hostname}`, {
    onUndo: () => {
      void runAction(async () => {
        await persistPausedSites(previous);
        render();
      }, "Failed to undo resume.");
    },
  });
}

async function handleStartPicker(): Promise<void> {
  if (state.tab.tabId === null || !state.tab.supportsContentRules) {
    showErrorToast("Could not start the picker on this page.");
    return;
  }

  const tabId = state.tab.tabId;
  const message: RuntimeMessage = { type: "START_PICKER" };

  try {
    const response = await new Promise<RuntimeMessageResponse | null>((resolve) => {
      chrome.tabs.sendMessage<RuntimeMessage, RuntimeMessageResponse>(
        tabId,
        message,
        (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result ?? null);
        },
      );
    });

    if (response === null || response.type === "PICKER_UNAVAILABLE") {
      showErrorToast("Could not start the picker on this page.");
      return;
    }

    window.close();
  } catch (error) {
    console.error("Failed to start picker.", error);
    showErrorToast("Could not start the picker on this page.");
  }
}

async function handleManualSubmit(): Promise<void> {
  const lines = parseSelectorLines(state.manualInput);
  if (lines.length === 0) {
    state.manualError = "Enter at least one selector.";
    render();
    return;
  }

  const invalidSelectors = getInvalidCssSelectors(lines);
  if (invalidSelectors.length > 0) {
    if (invalidSelectors.length === 1) {
      state.manualError = `This selector looks invalid: ${invalidSelectors[0]}`;
    } else {
      state.manualError = `${invalidSelectors.length} selectors need fixing`;
    }
    render();
    return;
  }

  state.manualError = null;

  if (state.manualScope === "this-site") {
    if (state.tab.hostname === null || !state.tab.supportsDomainRules) {
      state.manualError = "Site-specific rules are not available on this page.";
      render();
      return;
    }
    const hostname = state.tab.hostname;
    const nextSelectorMap: SelectorMap = {
      ...state.selectorMap,
      [hostname]: mergeUniqueSelectors(state.selectorMap[hostname] ?? [], lines),
    };
    await persistSelectorMap(nextSelectorMap);
    showToast(
      lines.length === 1
        ? `Rule added for ${hostname}`
        : `${lines.length} rules added to ${hostname}`,
    );
  } else {
    const nextSelectorMap: SelectorMap = {
      ...state.selectorMap,
      general: mergeUniqueSelectors(state.selectorMap.general, lines),
    };
    await persistSelectorMap(nextSelectorMap);
    showToast(
      lines.length === 1
        ? "Rule added for all sites"
        : `${lines.length} rules added to all sites`,
    );
  }

  state.manualInput = "";
  manualSelectors.value = "";
  render();
}

async function handleRemoveSelector(hostname: string, selector: string): Promise<void> {
  const previous = state.selectorMap;
  const existingSelectors = state.selectorMap[hostname];
  if (!Array.isArray(existingSelectors)) {
    return;
  }

  const nextSelectors = existingSelectors.filter((entry) => entry !== selector);
  const nextSelectorMap: SelectorMap = { ...state.selectorMap };

  if (hostname === "general") {
    nextSelectorMap.general = nextSelectors;
  } else if (nextSelectors.length === 0) {
    delete nextSelectorMap[hostname];
  } else {
    nextSelectorMap[hostname] = nextSelectors;
  }

  await persistSelectorMap(nextSelectorMap);
  render();

  showToast("Rule removed", {
    onUndo: () => {
      void runAction(async () => {
        await persistSelectorMap(previous);
        render();
      }, "Failed to undo rule removal.");
    },
  });
}

async function handleResumeHostname(hostname: string): Promise<void> {
  const previous = state.pausedSites;
  const nextPausedSites = state.pausedSites.filter((entry) => entry !== hostname);
  await persistPausedSites(nextPausedSites);
  render();

  showToast(`Protection turned back on for ${hostname}`, {
    onUndo: () => {
      void runAction(async () => {
        await persistPausedSites(previous);
        render();
      }, "Failed to undo resume.");
    },
  });
}

async function handlePauseFromManage(hostname: string): Promise<void> {
  if (state.pausedSites.includes(hostname)) {
    pausedAddError.hidden = false;
    pausedAddError.textContent = "That site is already paused.";
    return;
  }
  const previous = state.pausedSites;
  const nextPausedSites = [...state.pausedSites, hostname];
  await persistPausedSites(nextPausedSites);
  pausedAddInput.value = "";
  pausedAddError.hidden = true;
  pausedAddError.textContent = "";
  render();

  showToast(`Protection paused on ${hostname}`, {
    onUndo: () => {
      void runAction(async () => {
        await persistPausedSites(previous);
        render();
      }, "Failed to undo pause.");
    },
  });
}

async function handleClearSiteRules(hostname: string): Promise<void> {
  const confirmed = await openConfirmDialog({
    title: "Remove all rules for this site?",
    description: `Every rule you've added for ${hostname} will be removed. Built-in protection stays on.`,
    hint: "You can undo this immediately after.",
    confirmLabel: "Remove all",
    destructive: true,
  });
  if (!confirmed) {
    return;
  }

  const previous = state.selectorMap;
  const nextSelectorMap: SelectorMap = { ...state.selectorMap };
  delete nextSelectorMap[hostname];
  await persistSelectorMap(nextSelectorMap);
  render();
  showToast(`All rules removed for ${hostname}`, {
    onUndo: () => {
      void runAction(async () => {
        await persistSelectorMap(previous);
        render();
      }, "Failed to undo clearing rules.");
    },
  });
}

function attachEventListeners(): void {
  globalToggle.addEventListener("click", () => {
    void runAction(async () => {
      await handleGlobalToggle(!state.enabled);
    }, "Failed to update Noads.");
  });

  manualScopeControl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const option = target.closest<HTMLButtonElement>(".segmented-option");
    if (option === null || option.disabled) {
      return;
    }
    const scope = option.dataset.scope as ManualScope | undefined;
    if (scope === undefined) {
      return;
    }
    state.manualScope = scope;
    render();
  });

  manualSelectors.addEventListener("input", () => {
    state.manualInput = manualSelectors.value;
    if (state.manualError !== null) {
      state.manualError = null;
      renderManualError();
    }
    renderManualSubmitLabel();
  });

  manualShowExamples.addEventListener("click", () => {
    state.manualExamplesOpen = !state.manualExamplesOpen;
    renderManualExamples();
  });

  manualSubmit.addEventListener("click", () => {
    void runAction(handleManualSubmit, "Failed to add rule.");
  });

  rulesPreviewList.addEventListener("click", (event) => {
    const removeButton = findRemoveButton(event);
    if (removeButton === null) {
      return;
    }
    const row = removeButton.closest<HTMLElement>(".rule-row");
    if (row === null) {
      return;
    }
    const hostname = row.dataset.hostname ?? "";
    const selector = row.dataset.selector ?? "";
    if (hostname.length === 0 || selector.length === 0) {
      return;
    }
    void runAction(
      () => handleRemoveSelector(hostname, selector),
      "Failed to remove rule.",
    );
  });

  rulesManageLink.addEventListener("click", () => {
    setView("manage-rules");
  });

  pausedSummaryLink.addEventListener("click", () => {
    setView("paused-sites");
  });

  manageScopeControl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const option = target.closest<HTMLButtonElement>(".segmented-option");
    if (option === null || option.disabled) {
      return;
    }
    const scope = option.dataset.scope as ManageScope | undefined;
    if (scope === undefined) {
      return;
    }
    state.manageScope = scope;
    render();
  });

  manageContent.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const removeButton = target.closest<HTMLButtonElement>('[data-action="remove"]');
    if (removeButton !== null) {
      const row = removeButton.closest<HTMLElement>(".rule-row");
      if (row !== null) {
        const hostname = row.dataset.hostname ?? "";
        const selector = row.dataset.selector ?? "";
        if (hostname.length > 0 && selector.length > 0) {
          void runAction(
            () => handleRemoveSelector(hostname, selector),
            "Failed to remove rule.",
          );
        }
      }
      return;
    }

    const clearSiteButton = target.closest<HTMLButtonElement>(
      '[data-action="clear-site"]',
    );
    if (clearSiteButton !== null && state.tab.hostname !== null) {
      void runAction(
        () => handleClearSiteRules(state.tab.hostname ?? ""),
        "Failed to clear rules.",
      );
    }
  });

  viewManageRules.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const backButton = target.closest<HTMLButtonElement>('[data-action="back"]');
    if (backButton !== null) {
      setView("home");
    }
  });

  viewPausedSites.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const backButton = target.closest<HTMLButtonElement>('[data-action="back"]');
    if (backButton !== null) {
      setView("home");
      return;
    }

    const resumeButton = target.closest<HTMLButtonElement>('[data-action="resume"]');
    if (resumeButton !== null) {
      const row = resumeButton.closest<HTMLElement>(".paused-row");
      if (row !== null) {
        const hostname = row.dataset.hostname ?? "";
        if (hostname.length > 0) {
          void runAction(
            () => handleResumeHostname(hostname),
            "Failed to resume site.",
          );
        }
      }
    }
  });

  pausedSearch.addEventListener("input", () => {
    state.pausedSearch = pausedSearch.value;
    renderPausedView();
  });

  pausedEmptyAction.addEventListener("click", () => {
    state.pausedSearch = "";
    pausedSearch.value = "";
    pausedSearch.focus();
    renderPausedView();
  });

  pausedAddInput.addEventListener("input", () => {
    if (!pausedAddError.hidden) {
      pausedAddError.hidden = true;
      pausedAddError.textContent = "";
    }
  });

  pausedAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      pausedAddSubmit.click();
    }
  });

  pausedAddSubmit.addEventListener("click", () => {
    const normalized = normalizeDomainEntry(pausedAddInput.value);
    if (normalized === null) {
      pausedAddError.hidden = false;
      pausedAddError.textContent = "Enter a valid domain, like example.com";
      return;
    }
    void runAction(() => handlePauseFromManage(normalized), "Failed to pause site.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.view !== "home") {
      setView("home");
    }
  });
}

function findRemoveButton(event: Event): HTMLButtonElement | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest<HTMLButtonElement>('[data-action="remove"]');
}

async function loadInitialState(): Promise<void> {
  try {
    app.dataset.state = "loading";
    const [syncStorageState, activeTab] = await Promise.all([
      getSyncStorageState(),
      getActiveTab(),
    ]);
    state.selectorMap = syncStorageState.selectorMap;
    state.pausedSites = syncStorageState.whitelist;
    state.enabled = syncStorageState.enabled;
    state.tab = getActiveTabContextFromTab(activeTab);
    state.ready = true;
    state.loadError = null;
  } catch (error) {
    console.error("Failed to load popup state.", error);
    state.ready = true;
    state.loadError = {
      title: "Could not load your settings",
      detail:
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Please try again.",
      retryLabel: "Try again",
      retry: () => {
        state.loadError = null;
        void loadInitialState();
      },
    };
  }

  render();
}

document.addEventListener("DOMContentLoaded", () => {
  attachEventListeners();
  setView("home");
  render();
  void loadInitialState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }
  if (!state.ready) {
    return;
  }
  void loadInitialState();
});
