const selectorValidationRoot = document.createDocumentFragment();

export function isValidCssSelector(selector: string): boolean {
  try {
    selectorValidationRoot.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function getInvalidCssSelectors(selectors: readonly string[]): string[] {
  return selectors.filter((selector) => !isValidCssSelector(selector));
}

export function createCachedSelectorValidator(
  onInvalidSelector?: (selector: string, error: unknown) => void,
): (selector: string) => boolean {
  const validSelectors = new Set<string>();
  const invalidSelectors = new Set<string>();

  return (selector: string): boolean => {
    if (validSelectors.has(selector)) {
      return true;
    }

    if (invalidSelectors.has(selector)) {
      return false;
    }

    try {
      selectorValidationRoot.querySelector(selector);
      validSelectors.add(selector);
      return true;
    } catch (error) {
      invalidSelectors.add(selector);
      onInvalidSelector?.(selector, error);
      return false;
    }
  };
}
