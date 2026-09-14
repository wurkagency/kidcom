import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CalendarShell } from "./CalendarShell";
import { toLocalDateOnly } from "../../lib/calendarDates";

// Post-launch backlog Phase D — proves the persistent PENDING_PARENT banner
// (spec 9.8) actually renders when the lock condition applies to a PARENT
// viewer, and doesn't when it doesn't — not just that the backend field
// exists.
const apiGetMock = vi.fn();
vi.mock("../../lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPatch: vi.fn(),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const mockUser = { id: "u1", email: "me@example.com", firstName: "Me", lastName: "User", avatarUrl: null, emailVerifiedAt: "2026-01-01" };
const mockChild = { id: "c1", firstName: "Kid", lastName: "", gender: "BOY", birthday: "2020-01-01", profileImageUrl: null, clothingSize: null, shoeSize: null };

vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, children: [mockChild], loading: false, refresh: vi.fn() }),
}));

function mockApiGet(daysUntilLocked: number | null, locked: boolean, role: "PARENT" | "FAMILY" = "PARENT") {
  apiGetMock.mockImplementation((url: string) => {
    if (url.includes("/calendar?")) return Promise.resolve({ events: [], custodyByDate: {} });
    if (url.includes("/family")) {
      return Promise.resolve({
        members: [
          {
            userId: mockUser.id,
            firstName: "Me",
            lastName: "User",
            avatarUrl: null,
            role,
            relationship: role === "PARENT" ? "MOTHER" : "AUNT",
            isMinorMember: false,
          },
        ],
      });
    }
    if (url.includes("/swap-requests")) return Promise.resolve({ items: [] });
    if (url.includes("/calendar-event-requests")) return Promise.resolve({ items: [] });
    if (url.includes("/custody-plan")) return Promise.resolve({ plan: null, locked, daysUntilLocked });
    return Promise.resolve({});
  });
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
      <CalendarShell />
    </MemoryRouter>
  );
}

describe("CalendarShell — PENDING_PARENT persistent banner (spec 9.8)", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows the banner to a PARENT when the lock condition applies (a countdown is present)", async () => {
    mockApiGet(12, false, "PARENT");
    renderShell();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    expect(await screen.findByText(/Custody scheduling works best with both parents/)).toBeTruthy();
    expect(screen.getByText("Invite a co-parent")).toBeTruthy();
  });

  it("does not show the banner once a second parent exists (daysUntilLocked null)", async () => {
    mockApiGet(null, false, "PARENT");
    renderShell();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    // Let effects settle before asserting an absence.
    await waitFor(() => expect(screen.queryByText(/Loading…/)).toBeNull());
    expect(screen.queryByText(/Custody scheduling works best with both parents/)).toBeNull();
  });

  it("does not show the banner to a non-PARENT viewer, even when the lock condition applies", async () => {
    mockApiGet(5, false, "FAMILY");
    renderShell();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Loading…/)).toBeNull());
    expect(screen.queryByText(/Custody scheduling works best with both parents/)).toBeNull();
  });
});

describe("CalendarShell — List view starts from today, not the 1st of the month", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("queries the calendar range starting at today's date, not the month start", async () => {
    mockApiGet(null, false, "PARENT");
    render(
      <MemoryRouter initialEntries={["/calendar?view=list"]}>
        <CalendarShell />
      </MemoryRouter>
    );

    const today = toLocalDateOnly(new Date());
    await waitFor(() => {
      const calendarCall = apiGetMock.mock.calls.find((call) => (call[0] as string).includes("/calendar?"));
      expect(calendarCall?.[0]).toContain(`start=${today}`);
    });
  });
});
