import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CalendarEventDto, ChildFamilyMember, ToggleChecklistItemRequest, ToggleConfirmationRequest } from "@kidcom/shared";

import { apiGet, apiPatch, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";
import { EventCard } from "./calendar/EventCard";

// Clicking an event from any calendar view used to jump straight into the
// edit form (EventFormPage) — no way to just look at an event without also
// being dropped into an editable state. This is the read-only stop in
// between: shows the event via the same "full" EventCard used in Week/
// Month/List (so it looks identical to how it appeared there, just full-
// screen), with an explicit "Edit Event" action at the bottom rather than
// editability being the click target itself. Fetches by id (route param is
// the source of truth) rather than depending on router state, so a direct
// link or page refresh still works.
export function EventDetailPage() {
  const { childId, eventId } = useParams<{ childId: string; eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<CalendarEventDto | null>(null);
  const [family, setFamily] = useState<ChildFamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useHeaderConfig({ title: event?.title ?? "Event", backTo: "/calendar" }, [event?.title]);

  useEffect(() => {
    if (!childId || !eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<CalendarEventDto>(`/children/${childId}/calendar-events/${eventId}`),
      apiGet<{ members: ChildFamilyMember[] }>(`/children/${childId}/family`),
    ])
      .then(([eventRes, familyRes]) => {
        if (cancelled) return;
        setEvent(eventRes);
        setFamily(familyRes.members);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Couldn't load that event");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId, eventId]);

  async function handleToggleChecklistItem(_: unknown, itemId: string, isChecked: boolean) {
    if (!childId || !eventId) return;
    try {
      const updated = await apiPatch<CalendarEventDto>(
        `/children/${childId}/calendar-events/${eventId}/checklist/${itemId}`,
        { isChecked } satisfies ToggleChecklistItemRequest
      );
      setEvent(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that checklist item — try again.");
    }
  }

  async function handleToggleConfirm(_: unknown, confirmed: boolean) {
    if (!childId || !eventId) return;
    try {
      const updated = await apiPatch<CalendarEventDto>(
        `/children/${childId}/calendar-events/${eventId}/confirm`,
        { confirmed } satisfies ToggleConfirmationRequest
      );
      setEvent(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update your confirmation — try again.");
    }
  }

  if (loading) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  if (!event || !childId || !eventId) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
          {error ?? "Couldn't find this event"}
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full px-container-padding gap-section-margin pt-4 pb-32">
      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}

      <EventCard
        event={{ ...event, childId }}
        variant="full"
        family={family}
        currentUserId={user?.id ?? null}
        onOpen={() => navigate(`/children/${childId}/calendar-events/${eventId}/edit`)}
        onToggleChecklistItem={handleToggleChecklistItem}
        onToggleConfirm={handleToggleConfirm}
      />

      {event.editable && (
        <button
          onClick={() => navigate(`/children/${childId}/calendar-events/${eventId}/edit`)}
          className="w-full py-4 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md active:scale-[0.98] transition-all"
        >
          Edit Event
        </button>
      )}
    </div>
  );
}
