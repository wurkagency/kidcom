import { describe, expect, it } from "vitest";

import { defineTheme, type ThemeManifest } from "./manifest";
import { SCREEN_IDS, SHELL_KINDS } from "./screens";

const Stub = () => null;

function completeManifest(): ThemeManifest {
  return {
    id: "aura",
    name: "Test",
    meta: { themeColor: "#000000", backgroundColor: "#ffffff" },
    shells: Object.fromEntries(SHELL_KINDS.map((k) => [k, Stub])) as unknown as ThemeManifest["shells"],
    screens: Object.fromEntries(SCREEN_IDS.map((id) => [id, Stub])) as unknown as ThemeManifest["screens"],
    Loading: Stub,
    ErrorFallback: Stub,
  };
}

describe("defineTheme", () => {
  it("accepts a manifest implementing every shell and screen", () => {
    expect(() => defineTheme(completeManifest())).not.toThrow();
  });

  it("rejects a manifest missing a screen", () => {
    const manifest = completeManifest();
    delete (manifest.screens as Partial<ThemeManifest["screens"]>).today;
    expect(() => defineTheme(manifest)).toThrow(/today/);
  });

  it("rejects a manifest missing a shell", () => {
    const manifest = completeManifest();
    delete (manifest.shells as Partial<ThemeManifest["shells"]>).app;
    expect(() => defineTheme(manifest)).toThrow(/app/);
  });

  it("rejects an unknown theme id", () => {
    const manifest = { ...completeManifest(), id: "nope" as ThemeManifest["id"] };
    expect(() => defineTheme(manifest)).toThrow();
  });
});
