import { describe, expect, it } from "vitest";

import { formatUrl } from "./format-url";

describe("formatUrl", () => {
  it("returns a friendly hostname and path for normal URLs", () => {
    expect(formatUrl("https://example.com/products/123?ref=abc")).toBe("example.com/products/123");
  });

  it("omits the root slash for homepage URLs", () => {
    expect(formatUrl("https://example.com/")).toBe("example.com");
  });

  it("passes through non-standard values unchanged", () => {
    expect(formatUrl("chrome://extensions")).toBe("chrome://extensions");
    expect(formatUrl("")).toBe("No URL");
  });
});
