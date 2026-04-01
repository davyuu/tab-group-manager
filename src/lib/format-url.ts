export function formatUrl(rawUrl: string): string {
  if (!rawUrl) {
    return "No URL";
  }

  if (rawUrl.startsWith("chrome://") || rawUrl.startsWith("chrome-extension://") || rawUrl.startsWith("edge://")) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch (_error) {
    return rawUrl;
  }
}
