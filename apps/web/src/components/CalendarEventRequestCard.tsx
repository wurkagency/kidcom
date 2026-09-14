import { useState, type FormEvent } from "react";
import type { CalendarEventRequestDto, CreateCalendarEventRequestRequest } from "@kidcom/shared";

import { Icon } from "./Icon";
import { apiPost, ApiRequestError } from "../lib/api";

// Post-launch backlog Phase C — close sibling of SwapRequestCard.tsx, for a
// FAMILY/Caregiver member asking a parent/guardian to add a calendar event
// rather than adding one directly (calendar_event:manage stays PARENT/
// GUARDIAN-only). Same inline-form-on-tap shape as the swap request card.
export function CalendarEventRequestCard({
  childId,
  selectedDate,
  onSent,
}: {
  childId: string;
  selectedDate: string; // "YYYY-MM-DD"
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("What's the event called?");
      return;
    }
    setSending(true);
    try {
      await apiPost<CalendarEventRequestDto>(`/children/${childId}/calendar-event-requests`, {
        category: "ACTIVITY",
        title: title.trim(),
        startsAt: new Date(`${selectedDate}T09:00:00`).toISOString(),
        message: message || undefined,
      } satisfies CreateCalendarEventRequestRequest);
      setSent(true);
      setTitle("");
      setMessage("");
      setOpen(false);
      onSent();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't send that request");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 mb-8 bg-surface-container-low rounded-3xl p-5 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-secondary-fixed/50 flex items-center justify-center mb-3">
        <Icon name="event" className="text-on-secondary-container" />
      </div>
      <h4 className="font-label-md text-label-md text-on-surface mb-1">Want something added to the calendar?</h4>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-4">
        Ask a parent or guardian to add an event for {selectedDate}.
      </p>

      {sent && <p className="font-label-md text-label-md text-primary mb-3">Request sent!</p>}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm"
        >
          Request Event
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the event? (e.g. Soccer practice)"
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional note"
            rows={2}
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
          {error && (
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-3 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
