import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { CalendarEventDto } from "@kidcom/shared";

import { EventDetailPage } from "./EventDetailPage";
import { HeaderProvider } from "../lib/HeaderContext";

// Clicking an event used to jump straight into the edit form — this page is
// the new read-only stop in between, with an explicit "Edit Event" action
// instead of the click target itself being editability.
const apiGetMock = vi.fn();
const apiPatchMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const mockUser = { id: "u1", email: "me@example.com", firstName: "Me", lastName: "User", avatarUrl: null, emailVerifiedAt: "2026-01-01" };
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

const baseEvent: CalendarEventDto = {
  id: "e1",
  category: "APPOINTMENT",
  title: "Dentist",
  startsAt: "2026-01-10T10:00:00.000Z",
  endsAt: "2026-01-10T11:00:00.000Z",
  allDay: false,
  notes: null,
  location: null,
  editable: true,
  assignedNote: null,
  contactName: null,
  contactDetail: null,
  confirmable: false,
  confirmedByUserIds: [],
  checklist: [],
  recurrenceIntervalWeeks: null,
  recurrenceEndsAt: null,
};

function mockApiGet(event: CalendarEventDto) {
  apiGetMock.mockImplementation((url: string) => {
    if (url.includes("/calendar-events/")) return Promise.resolve(event);
    if (url.includes("/family")) return Promise.resolve({ members: [] });
    return Promise.resolve({});
  });
}

function renderAt(path: string) {
  return render(
    <HeaderProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/children/:childId/calendar-events/:eventId" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </HeaderProvider>
  );
}

describe("EventDetailPage — view before edit", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPatchMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows the event read-only with a green full-width Edit Event button when editable", async () => {
    mockApiGet(baseEvent);
    renderAt("/children/c1/calendar-events/e1");

    expect(await screen.findByText("Dentist")).toBeTruthy();
    const editButton = screen.getByRole("button", { name: "Edit Event" });
    expect(editButton.className).toContain("bg-primary");
    expect(editButton.className).toContain("w-full");
  });

  it("does not show the Edit Event button when the event isn't editable (e.g. a system holiday)", async () => {
    mockApiGet({ ...baseEvent, editable: false });
    renderAt("/children/c1/calendar-events/e1");

    await screen.findByText("Dentist");
    expect(screen.queryByRole("button", { name: "Edit Event" })).toBeNull();
  });

  it("fetches the event by the route id, not router state, so a direct link/refresh works", async () => {
    mockApiGet(baseEvent);
    renderAt("/children/c1/calendar-events/e1");

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/children/c1/calendar-events/e1");
    });
  });
});
