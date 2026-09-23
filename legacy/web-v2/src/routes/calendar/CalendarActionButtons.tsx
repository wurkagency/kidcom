import { Icon } from "../../components/Icon";

// The single "Add Appointment / Event" action, placed directly above the
// "Need a schedule adjustment?" swap card (SwapRequestCard already has its
// own "Request Swap" button, so this doesn't duplicate one) — matches the
// mockups' primary button style but inline rather than a sticky footer, so
// it reads as sitting right above the swap card rather than floating over
// it.
export function CalendarActionButtons({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full py-3.5 px-4 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:bg-primary-container transition-all flex items-center justify-center gap-2"
    >
      <Icon name="add" className="text-base" />
      <span className="font-semibold">Add Appointment / Event</span>
    </button>
  );
}
