import { getSyncStorageState, setSyncStorageState } from "./browser";
import { mergeUniqueSelectors } from "./selectors";
import { isValidCssSelector } from "./selectorValidation";
import type { SelectorMap } from "./types";

type PickerScope = "this-site" | "all-sites";

interface PickerContext {
  hostname: string;
  supportsDomainRules: boolean;
}

const PICKER_HOST_TAG = "noads-picker-root";
let activePickerController: AbortController | null = null;

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([^\w-])/g, "\\$1");
}

const VOLATILE_CLASS_PATTERNS = [
  /^is-/,
  /^has-/,
  /^js-/,
  /^ng-/,
  /^v-/,
  /^css-/,
  /^__/,
  /active$/,
  /focus$/,
  /hover$/,
  /open$/,
  /selected$/,
  /^ember/,
];

function isStableClassName(className: string): boolean {
  if (className.length === 0 || className.length > 40) {
    return false;
  }
  return !VOLATILE_CLASS_PATTERNS.some((pattern) => pattern.test(className));
}

function generateSelectorForElement(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  const elementId = element.id;
  if (elementId && /^[A-Za-z][\w-]{0,63}$/.test(elementId)) {
    return `#${cssEscape(elementId)}`;
  }

  const stableClasses = Array.from(element.classList).filter(isStableClassName);
  if (stableClasses.length > 0) {
    const selectedClasses = stableClasses.slice(0, 2).map((className) => {
      return `.${cssEscape(className)}`;
    });
    return `${tagName}${selectedClasses.join("")}`;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.length > 0 && ariaLabel.length < 80) {
    return `${tagName}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
  }

  const dataTestId = element.getAttribute("data-testid");
  if (dataTestId && dataTestId.length > 0 && dataTestId.length < 80) {
    return `${tagName}[data-testid="${dataTestId}"]`;
  }

  const role = element.getAttribute("role");
  if (role && role.length > 0 && role.length < 40) {
    return `${tagName}[role="${role}"]`;
  }

  return tagName;
}

function injectShadowStyles(shadowRoot: ShadowRoot): void {
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .mask {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.08);
      pointer-events: none;
    }
    .highlight {
      position: fixed;
      pointer-events: none;
      border: 2px solid #2563EB;
      border-radius: 4px;
      background-color: rgba(37, 99, 235, 0.12);
      box-sizing: border-box;
      transition: top 80ms ease-out, left 80ms ease-out, width 80ms ease-out, height 80ms ease-out;
      display: none;
    }
    .coachmark {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
      height: 52px;
      max-width: 520px;
      padding: 0 16px;
      background-color: #FFFFFF;
      color: #0F172A;
      border-radius: 14px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      font-family: "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      pointer-events: auto;
      animation: coachmark-in 220ms cubic-bezier(0.2, 0, 0, 1);
    }
    @keyframes coachmark-in {
      from { opacity: 0; transform: translate(-50%, 8px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    .coachmark-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
    }
    .coachmark-title {
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: #0F172A;
    }
    .coachmark-subtitle {
      font-size: 12px;
      line-height: 16px;
      color: #64748B;
    }
    .coachmark-cancel {
      appearance: none;
      border: 0;
      background: transparent;
      color: #2563EB;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
    }
    .coachmark-cancel:hover { background-color: rgba(37, 99, 235, 0.08); }
    .confirm {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: min(420px, calc(100vw - 24px));
      padding: 16px;
      background-color: #FFFFFF;
      color: #0F172A;
      border-radius: 16px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      font-family: "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: coachmark-in 220ms cubic-bezier(0.2, 0, 0, 1);
    }
    .confirm-title {
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
      color: #0F172A;
    }
    .confirm-description {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: #475569;
    }
    .scope {
      display: inline-flex;
      padding: 3px;
      background-color: #F1F5F9;
      border-radius: 10px;
      gap: 2px;
      align-self: flex-start;
    }
    .scope-option {
      appearance: none;
      border: 0;
      height: 30px;
      padding: 0 12px;
      background-color: transparent;
      font-size: 13px;
      line-height: 18px;
      font-weight: 500;
      color: #475569;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
    }
    .scope-option:hover { color: #0F172A; }
    .scope-option.is-active {
      background-color: #FFFFFF;
      color: #0F172A;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    }
    .scope-option[disabled] { cursor: not-allowed; opacity: 0.5; }
    .confirm-caution {
      margin: 0;
      padding: 8px 10px;
      background-color: rgba(217, 119, 6, 0.12);
      color: #B45309;
      font-size: 12px;
      line-height: 18px;
      border-radius: 8px;
    }
    .confirm-caution[hidden] { display: none; }
    .advanced-field {
      display: none;
      flex-direction: column;
      gap: 6px;
    }
    .advanced-field.is-open { display: flex; }
    .advanced-input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      background-color: #F8FAFC;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 13px;
      line-height: 18px;
      color: #0F172A;
      outline: none;
    }
    .advanced-input:focus {
      border-color: #2563EB;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22);
    }
    .advanced-error {
      display: none;
      margin: 0;
      padding: 8px 10px;
      background-color: rgba(220, 38, 38, 0.1);
      color: #DC2626;
      font-size: 12px;
      line-height: 18px;
      border-radius: 8px;
    }
    .advanced-error.is-visible { display: block; }
    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .confirm-actions-right {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }
    .btn {
      appearance: none;
      border: 1px solid transparent;
      height: 40px;
      padding: 0 16px;
      border-radius: 10px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
    }
    .btn-primary {
      background-color: #2563EB;
      color: #FFFFFF;
      border-color: #2563EB;
    }
    .btn-primary:hover { background-color: #1D4ED8; border-color: #1D4ED8; }
    .btn-ghost {
      background-color: transparent;
      color: #0F172A;
      border-color: #E2E8F0;
    }
    .btn-ghost:hover { background-color: rgba(37, 99, 235, 0.06); }
    .btn-text {
      appearance: none;
      border: 0;
      background: transparent;
      color: #2563EB;
      font-size: 13px;
      line-height: 18px;
      font-weight: 500;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 8px;
      font-family: inherit;
    }
    .btn-text:hover { background-color: rgba(37, 99, 235, 0.06); }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(15, 23, 42, 0.95);
      color: #FFFFFF;
      padding: 10px 14px;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
      font-family: "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 18px;
      pointer-events: none;
      animation: coachmark-in 220ms cubic-bezier(0.2, 0, 0, 1);
    }
  `;
  shadowRoot.appendChild(style);
}

function isInsideHost(target: EventTarget | null, host: HTMLElement): boolean {
  if (!(target instanceof Node)) {
    return false;
  }
  return host.contains(target);
}

interface PickerElements {
  host: HTMLElement;
  shadow: ShadowRoot;
  mask: HTMLDivElement;
  highlight: HTMLDivElement;
  coachmark: HTMLDivElement;
  confirm: HTMLDivElement;
}

function buildPickerDom(): PickerElements {
  const host = document.createElement(PICKER_HOST_TAG);
  host.style.cssText = [
    "position: fixed",
    "inset: 0",
    "width: 100vw",
    "height: 100vh",
    "z-index: 2147483647",
    "pointer-events: none",
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });
  injectShadowStyles(shadow);

  const mask = document.createElement("div");
  mask.className = "mask";
  shadow.appendChild(mask);

  const highlight = document.createElement("div");
  highlight.className = "highlight";
  shadow.appendChild(highlight);

  const coachmark = document.createElement("div");
  coachmark.className = "coachmark";
  coachmark.innerHTML = `
    <div class="coachmark-text">
      <span class="coachmark-title">Click what you want to remove</span>
      <span class="coachmark-subtitle">Press Esc to cancel</span>
    </div>
    <button type="button" class="coachmark-cancel" data-picker-cancel>Cancel</button>
  `;
  shadow.appendChild(coachmark);

  const confirm = document.createElement("div");
  confirm.className = "confirm";
  confirm.style.display = "none";
  shadow.appendChild(confirm);

  document.documentElement.appendChild(host);

  return { host, shadow, mask, highlight, coachmark, confirm };
}

function updateHighlight(highlight: HTMLDivElement, element: Element | null): void {
  if (element === null) {
    highlight.style.display = "none";
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    highlight.style.display = "none";
    return;
  }

  highlight.style.display = "block";
  highlight.style.top = `${rect.top}px`;
  highlight.style.left = `${rect.left}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
}

async function persistSelector(
  selector: string,
  scope: PickerScope,
  hostname: string,
): Promise<void> {
  const state = await getSyncStorageState();
  const nextSelectorMap: SelectorMap = { ...state.selectorMap };

  if (scope === "all-sites") {
    nextSelectorMap.general = mergeUniqueSelectors(state.selectorMap.general, [
      selector,
    ]);
  } else {
    const existingSelectors = state.selectorMap[hostname] ?? [];
    nextSelectorMap[hostname] = mergeUniqueSelectors(existingSelectors, [selector]);
  }

  await setSyncStorageState({ selectorMap: nextSelectorMap });
}

function showToastInShadow(shadow: ShadowRoot, message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  shadow.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2400);
}

function renderConfirmDialog(
  confirm: HTMLDivElement,
  options: {
    initialSelector: string;
    context: PickerContext;
    onCancel: () => void;
    onSubmit: (selector: string, scope: PickerScope) => void;
  },
): void {
  const { initialSelector, context, onCancel, onSubmit } = options;
  let scope: PickerScope = context.supportsDomainRules ? "this-site" : "all-sites";
  let advancedOpen = false;
  let workingSelector = initialSelector;

  confirm.innerHTML = `
    <h3 class="confirm-title">Hide this element?</h3>
    <p class="confirm-description" data-description></p>
    <div class="scope" role="tablist" aria-label="Rule scope">
      <button type="button" class="scope-option" data-scope="this-site" role="tab">This site</button>
      <button type="button" class="scope-option" data-scope="all-sites" role="tab">All sites</button>
    </div>
    <p class="confirm-caution" data-caution hidden></p>
    <div class="advanced-field" data-advanced>
      <input type="text" class="advanced-input" data-advanced-input spellcheck="false" autocomplete="off" />
      <p class="advanced-error" data-advanced-error></p>
    </div>
    <div class="confirm-actions">
      <button type="button" class="btn-text" data-toggle-advanced>Edit advanced selector</button>
      <div class="confirm-actions-right">
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-submit>Hide on this site</button>
      </div>
    </div>
  `;
  confirm.style.display = "flex";

  const scopeOptions = Array.from(
    confirm.querySelectorAll<HTMLButtonElement>(".scope-option"),
  );
  const descriptionElement =
    confirm.querySelector<HTMLParagraphElement>("[data-description]");
  const cautionElement = confirm.querySelector<HTMLParagraphElement>("[data-caution]");
  const advancedField = confirm.querySelector<HTMLDivElement>("[data-advanced]");
  const advancedInput = confirm.querySelector<HTMLInputElement>(
    "[data-advanced-input]",
  );
  const advancedError = confirm.querySelector<HTMLParagraphElement>(
    "[data-advanced-error]",
  );
  const toggleAdvancedButton = confirm.querySelector<HTMLButtonElement>(
    "[data-toggle-advanced]",
  );
  const cancelButton = confirm.querySelector<HTMLButtonElement>("[data-cancel]");
  const submitButton = confirm.querySelector<HTMLButtonElement>("[data-submit]");

  function updateScopeUi(): void {
    scopeOptions.forEach((option) => {
      const isActive = option.dataset.scope === scope;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-selected", String(isActive));
    });

    if (descriptionElement !== null) {
      descriptionElement.textContent =
        scope === "all-sites"
          ? "Noads will create a rule for similar elements on every site."
          : `Noads will create a rule for similar elements on ${context.hostname}.`;
    }

    if (cautionElement !== null) {
      if (scope === "all-sites") {
        cautionElement.hidden = false;
        cautionElement.textContent =
          "All sites is broader and may hide matching elements on pages where you don't expect it.";
      } else {
        cautionElement.hidden = true;
        cautionElement.textContent = "";
      }
    }

    if (submitButton !== null) {
      submitButton.textContent =
        scope === "all-sites" ? "Hide on all sites" : "Hide on this site";
    }
  }

  function updateAdvancedUi(): void {
    if (advancedField === null) {
      return;
    }
    advancedField.classList.toggle("is-open", advancedOpen);
    if (advancedOpen && advancedInput !== null) {
      advancedInput.value = workingSelector;
      advancedInput.focus();
      advancedInput.select();
    }
  }

  function setError(message: string | null): void {
    if (advancedError === null) {
      return;
    }
    if (message === null) {
      advancedError.classList.remove("is-visible");
      advancedError.textContent = "";
    } else {
      advancedError.textContent = message;
      advancedError.classList.add("is-visible");
    }
  }

  scopeOptions.forEach((option) => {
    const optionScope = option.dataset.scope as PickerScope | undefined;
    if (optionScope === "this-site" && !context.supportsDomainRules) {
      option.setAttribute("disabled", "true");
    }
    option.addEventListener("click", () => {
      if (optionScope === undefined) {
        return;
      }
      if (optionScope === "this-site" && !context.supportsDomainRules) {
        return;
      }
      scope = optionScope;
      updateScopeUi();
    });
  });

  toggleAdvancedButton?.addEventListener("click", () => {
    advancedOpen = !advancedOpen;
    updateAdvancedUi();
  });

  advancedInput?.addEventListener("input", () => {
    workingSelector = advancedInput.value.trim();
    setError(null);
  });

  cancelButton?.addEventListener("click", () => {
    onCancel();
  });

  submitButton?.addEventListener("click", () => {
    const selectorToUse = advancedOpen
      ? workingSelector.trim()
      : initialSelector.trim();

    if (selectorToUse.length === 0) {
      setError("Enter a selector to continue.");
      return;
    }

    if (!isValidCssSelector(selectorToUse)) {
      setError(`This selector looks invalid: ${selectorToUse}`);
      return;
    }

    onSubmit(selectorToUse, scope);
  });

  updateScopeUi();
  updateAdvancedUi();
}

export function isPickerActive(): boolean {
  return activePickerController !== null;
}

export async function startPicker(context: PickerContext): Promise<void> {
  if (activePickerController !== null) {
    return;
  }

  const controller = new AbortController();
  activePickerController = controller;

  const elements = buildPickerDom();
  const originalUserSelect = document.documentElement.style.userSelect;
  document.documentElement.style.userSelect = "none";

  let hoveredElement: Element | null = null;
  let confirmMode = false;

  function cleanup(): void {
    controller.abort();
    elements.host.remove();
    document.documentElement.style.userSelect = originalUserSelect;
    if (activePickerController === controller) {
      activePickerController = null;
    }
  }

  function getElementAtPoint(clientX: number, clientY: number): Element | null {
    const candidate = document.elementFromPoint(clientX, clientY);
    if (candidate === null) {
      return null;
    }
    if (candidate === elements.host || elements.host.contains(candidate)) {
      return null;
    }
    if (candidate === document.body || candidate === document.documentElement) {
      return null;
    }
    return candidate;
  }

  function handleMouseMove(event: MouseEvent): void {
    if (confirmMode) {
      return;
    }
    if (isInsideHost(event.target, elements.host)) {
      hoveredElement = null;
      updateHighlight(elements.highlight, null);
      return;
    }
    const target = getElementAtPoint(event.clientX, event.clientY);
    hoveredElement = target;
    updateHighlight(elements.highlight, target);
  }

  function handleClick(event: MouseEvent): void {
    if (isInsideHost(event.target, elements.host)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    const target = getElementAtPoint(event.clientX, event.clientY);
    if (target === null) {
      return;
    }

    confirmMode = true;
    elements.coachmark.style.display = "none";
    updateHighlight(elements.highlight, target);

    const initialSelector = generateSelectorForElement(target);

    renderConfirmDialog(elements.confirm, {
      initialSelector,
      context,
      onCancel: () => {
        cleanup();
      },
      onSubmit: (selector, scope) => {
        void persistSelector(selector, scope, context.hostname)
          .then(() => {
            showToastInShadow(
              elements.shadow,
              scope === "all-sites"
                ? "Rule added for all sites"
                : `Rule added for ${context.hostname}`,
            );
            window.setTimeout(() => {
              cleanup();
            }, 900);
          })
          .catch((error: unknown) => {
            console.error("Failed to save picker rule.", error);
            const advancedError = elements.confirm.querySelector<HTMLParagraphElement>(
              "[data-advanced-error]",
            );
            if (advancedError !== null) {
              advancedError.textContent = "Could not save this rule. Please try again.";
              advancedError.classList.add("is-visible");
            }
          });
      },
    });
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    }
  }

  function handleScrollOrResize(): void {
    if (hoveredElement !== null && !confirmMode) {
      updateHighlight(elements.highlight, hoveredElement);
    }
  }

  function handleCancelButtonClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-picker-cancel]") !== null) {
      cleanup();
    }
  }

  document.addEventListener("mousemove", handleMouseMove, {
    capture: true,
    signal: controller.signal,
  });
  document.addEventListener("click", handleClick, {
    capture: true,
    signal: controller.signal,
  });
  document.addEventListener("keydown", handleKeyDown, {
    capture: true,
    signal: controller.signal,
  });
  window.addEventListener("scroll", handleScrollOrResize, {
    capture: true,
    passive: true,
    signal: controller.signal,
  });
  window.addEventListener("resize", handleScrollOrResize, {
    signal: controller.signal,
  });
  elements.coachmark.addEventListener("click", handleCancelButtonClick, {
    signal: controller.signal,
  });
}
