import type { ChildFamilyMember } from "@kidcom/shared";

import { Icon } from "../../components/Icon";
import { CALENDAR_CATEGORY_META } from "../../lib/calendarCategories";
import { googleMapsUrl } from "../../lib/calendarDates";
import { resolveParentShortLabel } from "../../lib/parentLabel";
import type { CalendarEventWithChild } from "../../lib/mergeCalendarRanges";

// Renders one event as a card. "full" matches docs/Themes/Aura/
// kidcom_calendar_2's timeline-event card (category badge + time, title,
// "Assigned:" pill, location row, an optional note box / contact card /
// checklist / confirmations strip) and is used by Week/Month/List alike
// per the redesign correction to make every view's cards match the week
// view. "compact" matches Month's Day
// Quick Preview card instead (a colored left bar + title/time/category
// row, no expanded detail).
export function EventCard({
  event,
  variant,
  family,
  currentUserId,
  onOpen,
  onToggleChecklistItem,
  onToggleConfirm,
}: {
  event: CalendarEventWithChild;
  variant: "full" | "compact";
  family: ChildFamilyMember[];
  currentUserId: string | null;
  onOpen: (event: CalendarEventWithChild) => void;
  onToggleChecklistItem?: (event: CalendarEventWithChild, itemId: string, isChecked: boolean) => void;
  onToggleConfirm?: (event: CalendarEventWithChild, confirmed: boolean) => void;
}) {
  const meta = CALENDAR_CATEGORY_META[event.category];
  const timeLabel = event.allDay
    ? "All day"
    : event.endsAt
      ? `${new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${new Date(
          event.endsAt
        ).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
      : new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const openable = event.editable;

  if (variant === "compact") {
    return (
      <div
        role={openable ? "button" : undefined}
        tabIndex={openable ? 0 : undefined}
        onClick={() => openable && onOpen(event)}
        onKeyDown={(e) => {
          if (!openable || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          onOpen(event);
        }}
        className={`flex items-start gap-3 p-3 rounded-xl bg-surface-container-low transition-colors hover:bg-surface-container ${
          openable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className={`w-1.5 self-stretch rounded-full ${meta.dotClass}`} />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-headline-md text-label-md text-on-surface truncate">{event.title}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">{timeLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`font-label-sm text-label-sm px-2 py-0.5 rounded-md font-medium ${meta.badgeClass}`}>
              {meta.label}
            </span>
            {event.location && (
              <span className="font-body-md text-label-sm text-on-surface-variant truncate">{event.location}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  const alreadyConfirmed = currentUserId != null && event.confirmedByUserIds.includes(currentUserId);
  const hasAccent = Boolean(meta.accentClass);

  return (
    <div
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={() => openable && onOpen(event)}
      onKeyDown={(e) => {
        if (!openable || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen(event);
      }}
      className={`bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 relative overflow-hidden flex flex-col gap-3 ${
        openable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {hasAccent && <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${meta.accentClass}`} />}

      <div className={`flex items-center justify-between ${hasAccent ? "pl-1" : ""}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${meta.badgeClass}`}>
            <Icon name={meta.icon} className="text-[15px]" />
            {meta.label}
          </span>
          <span className="text-xs font-semibold text-on-surface-variant truncate">{timeLabel}</span>
        </div>
        <button
          aria-label="Edit event"
          onClick={(e) => {
            e.stopPropagation();
            if (openable) onOpen(event);
          }}
          className="text-on-surface-variant hover:text-on-surface transition-colors p-0.5 shrink-0"
        >
          <Icon name="more_vert" className="text-[20px]" />
        </button>
      </div>

      <div className={hasAccent ? "pl-1" : ""}>
        <h3 className="font-headline-md text-lg leading-snug font-bold text-on-surface tracking-tight">
          {event.title}
        </h3>
        {event.assignedNote && (
          <div className="mt-1">
            <span className="inline-block bg-surface-container-low text-on-surface-variant text-xs font-medium px-2.5 py-0.5 rounded-full">
              Assigned: {event.assignedNote}
            </span>
          </div>
        )}
      </div>

      {event.location && (
        <a
          href={googleMapsUrl(event.location)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-1.5 text-xs text-on-surface-variant ${hasAccent ? "pl-1" : ""}`}
        >
          <Icon name="location_on" className={`text-base ${meta.iconAccentClass}`} />
          {event.location}
        </a>
      )}

      {event.notes &&
        (event.category === "MEDICAL" ? (
          <div className={`bg-journal-peach/30 border border-journal-peach rounded-xl p-3 flex items-start gap-2.5 text-xs leading-relaxed text-on-surface-variant ${hasAccent ? "ml-1" : ""}`}>
            <Icon name="health_and_safety" className="text-lg text-secondary mt-0.5 shrink-0" />
            <p className="flex-1">
              <strong className="font-semibold text-on-surface">Note:</strong> {event.notes}
            </p>
          </div>
        ) : (
          <div className="bg-secondary-container/20 border border-secondary-container/40 rounded-xl p-3 flex items-start gap-2.5 text-xs leading-relaxed text-on-surface-variant">
            <Icon name="calendar_today" className="text-lg text-secondary mt-0.5 shrink-0" />
            <p className="flex-1">
              <strong className="font-semibold text-on-surface">Note:</strong> {event.notes}
            </p>
          </div>
        ))}

      {(event.contactName || event.contactDetail) && (
        <div className={`bg-surface-container-low rounded-xl p-3 flex items-center justify-between gap-3 border border-outline-variant/30 ${hasAccent ? "ml-1" : ""}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-bold text-sm flex items-center justify-center shrink-0">
              {(event.contactName ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              {event.contactName && (
                <p className="font-label-md text-sm font-semibold text-on-surface truncate">{event.contactName}</p>
              )}
              {event.contactDetail && (
                <p className="text-xs text-on-surface-variant truncate">{event.contactDetail}</p>
              )}
            </div>
          </div>
          <a
            href={googleMapsUrl(event.contactDetail || event.location || event.contactName || "")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Directions"
            onClick={(e) => e.stopPropagation()}
            className="w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center text-primary shadow-sm hover:bg-surface transition-colors shrink-0"
          >
            <Icon name="near_me" className="text-lg" />
          </a>
        </div>
      )}

      {event.checklist.length > 0 && (
        <div className={`flex flex-col gap-1.5 ${hasAccent ? "ml-1" : ""}`}>
          {event.checklist.map((item) => (
            <div
              key={item.id}
              className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3 flex items-center justify-between gap-2 text-xs leading-relaxed text-on-surface-variant"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="check_circle" className="text-lg text-primary shrink-0" />
                <span className="truncate">
                  <strong className="font-semibold text-on-surface">Bring:</strong> {item.label}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleChecklistItem?.(event, item.id, !item.isChecked);
                }}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                  item.isChecked ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"
                }`}
              >
                {item.isChecked ? "Packed" : "Pack it"}
              </button>
            </div>
          ))}
        </div>
      )}

      {event.confirmable && (
        <div className={`flex items-center justify-between pt-0.5 ${hasAccent ? "pl-1" : ""}`}>
          <div className="flex items-center -space-x-1.5">
            {event.confirmedByUserIds.map((userId) => (
              <div
                key={userId}
                className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center text-[10px] font-bold text-on-primary-fixed"
                title={family.find((m) => m.userId === userId)?.firstName}
              >
                {resolveParentShortLabel(family, userId).slice(0, 1)}
              </div>
            ))}
            <span className="text-on-surface-variant font-label-sm text-xs pl-3">
              {event.confirmedByUserIds.length === 0
                ? "No confirmations yet"
                : event.confirmedByUserIds.length >= 2
                  ? "Both parents confirmed"
                  : "1 confirmed"}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleConfirm?.(event, !alreadyConfirmed);
            }}
            className="font-label-md text-xs text-primary font-semibold shrink-0 hover:underline"
          >
            {alreadyConfirmed ? "Unconfirm" : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}
