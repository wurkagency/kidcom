import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("accepts a plain same-origin path", () => {
    expect(safeRedirectPath("/invite/abc123")).toBe("/invite/abc123");
  });

  it("preserves query and hash on a valid path", () => {
    expect(safeRedirectPath("/children/1?tab=media#top")).toBe("/children/1?tab=media#top");
  });

  it("rejects null/empty", () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
  });

  it("rejects protocol-relative redirects (//evil.com)", () => {
    expect(safeRedirectPath("//evil.com")).toBeNull();
    expect(safeRedirectPath("//evil.com/phish")).toBeNull();
  });

  it("rejects backslash-based redirects the URL parser normalizes to protocol-relative (/\\evil.com)", () => {
    expect(safeRedirectPath("/\\evil.com")).toBeNull();
    expect(safeRedirectPath("/\\/evil.com")).toBeNull();
  });

  it("rejects absolute URLs to another origin", () => {
    expect(safeRedirectPath("https://evil.com")).toBeNull();
    expect(safeRedirectPath("http://evil.com/path")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
  });
});
