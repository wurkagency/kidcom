import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { VerifyEmailPage } from "./VerifyEmailPage";

// Mocks matching the real call sites this component uses.
const apiGetMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const refreshMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ refresh: refreshMock }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("VerifyEmailPage — remount does not resubmit a consumed token", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    refreshMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls the verify endpoint exactly once even when the component is unmounted and remounted with the same token (the real App.tsx branch-switch scenario)", async () => {
    apiGetMock.mockResolvedValue({ user: { id: "1", emailVerifiedAt: "2026-01-01T00:00:00Z" } });

    const path = "/verify-email?token=abc123";

    // First mount: App.tsx's "unverified" branch renders VerifyEmailPage.
    const first = renderAt(path);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(1));

    // The success handler calls refresh(), which is exactly what flips
    // App.tsx's top-level branch from "unverified" to "authenticated" —
    // unmounting this tree and mounting a fresh VerifyEmailPage instance
    // at the same URL in the new branch's route table.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    first.unmount();

    // Second mount: same token, brand-new component instance — this is
    // the exact remount that previously resubmitted the already-consumed
    // token and overwrote the real success with a false "invalid or
    // expired" error.
    renderAt(path);

    // Give any wrongly-fired effect a tick to have called the API again.
    await new Promise((r) => setTimeout(r, 50));

    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });
});
