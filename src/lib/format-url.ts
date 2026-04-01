export function formatUrl(rawUrl: string): string {
  if (!rawUrl) {
    return "No URL";
  }

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch (_error) {
    return rawUrl;
  }
}
