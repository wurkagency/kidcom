import { useState, type FormEvent } from "react";
import type { CreateSwapRequestRequest, SwapRequestDto } from "@kidcom/shared";

import { Icon } from "./Icon";
import { apiPost, ApiRequestError } from "../lib/api";

// Matches the "Request Swap" card at the bottom of
// docs/stitch_splitkid/calendar_custody/code.html. Opens an inline form for
// the selected date rather than a separate screen — keeps the flow to one
// tap from the calendar.
export function SwapRequestCard({
  childId,
  selectedDate,
  onSent,
}: {
  childId: string;
  selectedDate: string; // "YYYY-MM-DD"
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await apiPost<SwapRequestDto>(`/children/${childId}/swap-requests`, {
        date: selectedDate,
        message: message || undefined,
      } satisfies CreateSwapRequestRequest);
      setSent(true);
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
        <Icon name="swap_horiz" className="text-on-secondary-container" />
      </div>
      <h4 className="font-label-md text-label-md text-on-surface mb-1">
        Need a schedule adjustment?
      </h4>
      <p className="font-body-md text-[14px] text-on-surface-variant mb-4">
        Request a swap or ask for coverage for {selectedDate}.
      </p>

      {sent && (
        <p className="font-label-md text-label-md text-primary mb-3">Swap request sent!</p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 rounded-full flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm"
        >
          Request Swap
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional note (e.g. why you're asking)"
            rows={2}
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
          {error && (
            <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
              {error}
            </p>
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
