import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BillingPage } from "./BillingPage";
import { HeaderProvider } from "../lib/HeaderContext";

// D9 (spec 9.14/§6.3): the checkout screen must disclose the VAT rate/net
// price alongside the unchanged gross price — this proves the disclosure
// actually renders, not just that vatBreakdown() computes correctly.
const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  ApiRequestError: class ApiRequestError extends Error {},
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/billing"]}>
      <HeaderProvider>
        <BillingPage />
      </HeaderProvider>
    </MemoryRouter>
  );
}

describe("BillingPage — D9 VAT disclosure", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiGetMock.mockResolvedValue({
      tier: "FREE",
      status: "ACTIVE",
      billingPeriod: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      trialExpired: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the VAT-inclusive rate and derived net price for the Parents and Family plans (annual, the default period)", async () => {
    renderPage();

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    // Gross prices (275/559 annual) must still be the headline figures —
    // D9 only adds a disclosure line, it never changes what's charged.
    expect(await screen.findByText("275")).toBeTruthy();
    expect(screen.getByText("559")).toBeTruthy();

    // Net prices derived from vatBreakdown(27500) / vatBreakdown(55900).
    expect(screen.getByText(/220\.00 kr excl\. VAT\/yr/)).toBeTruthy();
    expect(screen.getByText(/447\.20 kr excl\. VAT\/yr/)).toBeTruthy();
    expect(screen.getAllByText(/incl\. 25% VAT/).length).toBeGreaterThanOrEqual(2);
  });
});
