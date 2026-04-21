const DOMAIN_BASED_PROTOCOLS = new Set(["http:", "https:"]);

function getUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function getHostnameFromUrl(url: string): string | null {
  const parsedUrl = getUrl(url);
  if (parsedUrl === null) {
    return null;
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  return hostname.length > 0 ? hostname : null;
}

export function supportsDomainBasedRules(url: string): boolean {
  const parsedUrl = getUrl(url);
  if (parsedUrl === null) {
    return false;
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  return (
    hostname.length > 0 && DOMAIN_BASED_PROTOCOLS.has(parsedUrl.protocol.toLowerCase())
  );
}

export function normalizeDomainEntry(value: string): string | null {
  const trimmedValue = value.trim().toLowerCase();
  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.includes("://")) {
    return getHostnameFromUrl(trimmedValue);
  }

  return getHostnameFromUrl(`https://${trimmedValue}`);
}

export function isHostnameWhitelisted(hostname: string, whitelist: string[]): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  return whitelist.some((entry) => {
    const normalizedEntry = entry.trim().toLowerCase();
    if (normalizedEntry.length === 0) {
      return false;
    }

    return (
      normalizedHostname === normalizedEntry ||
      normalizedHostname.endsWith(`.${normalizedEntry}`)
    );
  });
}

export function isUrlWhitelisted(url: string, whitelist: string[]): boolean {
  const hostname = getHostnameFromUrl(url);
  return hostname === null ? false : isHostnameWhitelisted(hostname, whitelist);
}
