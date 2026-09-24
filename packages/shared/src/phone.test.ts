import { describe, it, expect } from "vitest";

import { isE164, isSupportedPhone, phoneCountryOf } from "./phone";

// The countries the API will text: exactly the ones the app offers, minus the
// ranges SMS pumping targets (security sweep 2026-09-24).

describe("isSupportedPhone", () => {
  it.each([
    ["Denmark mobile", "+4520123456"],
    ["Finland (3-digit code)", "+358401234567"],
    ["UK mobile (07…)", "+447400123456"],
    ["US", "+12015550123"],
    ["Canada (shares +1)", "+14165550123"],
  ])("allows %s", (_label, phone) => {
    expect(isSupportedPhone(phone)).toBe(true);
  });

  it.each([
    ["Jamaica (+1 876)", "+18765550123"],
    ["Dominican Republic (+1 809)", "+18095550123"],
    ["a US premium-rate 900 number", "+19005550123"],
    ["a US toll-free number", "+18005550123"],
    ["a UK personal number (070)", "+447012345678"],
    ["a country the app doesn't offer (Russia)", "+79161234567"],
    ["a malformed number", "+45 20 12 34 56"],
    ["a number without +", "4520123456"],
    ["not a string", 4520123456],
  ])("refuses %s", (_label, phone) => {
    expect(isSupportedPhone(phone)).toBe(false);
  });

  it("recognises the country, longest dial code first", () => {
    expect(phoneCountryOf("+358401234567")?.iso).toBe("FI");
    expect(phoneCountryOf("+4520123456")?.iso).toBe("DK");
    expect(phoneCountryOf("+79161234567")).toBeNull();
  });

  it("E.164 shape", () => {
    expect(isE164("+4520123456")).toBe(true);
    expect(isE164("+0520123456")).toBe(false);
    expect(isE164("+45201")).toBe(false);
  });
});
