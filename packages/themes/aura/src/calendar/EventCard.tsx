import type { CalendarEventDto, CategoryDto, ChildFamilyMember } from "@kidcom/shared";
import { Link, paths, useCurrentUser, useFormat, useT, useToggleChecklistItem } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { CategoryChip } from "./CategoryChip";
import { findMember, usePersonName } from "./people";
import { toneOf } from "./tones";

// The appointment card from kidcom_today_screen_updated_note and
// kidcom_calendar_1-3: category chip + time, title, place with a directions
// pill, then the event's to-dos, a note row, a packing-list row and — when
// someone else handles it — the faded "Handled by …" state.

export const mapsUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

type Props = { event: CalendarEventDto; category: CategoryDto | undefined; members: ChildFamilyMember[] };

export function EventCard({ event, category, members }: Props) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const me = useCurrentUser();
  const person = usePersonName();
  const toggle = useToggleChecklistItem(event.childId);
  const tone = toneOf(category?.tone);

  const todos = event.checklist.filter((i) => i.kind === "TASK");
  const packing = event.checklist.filter((i) => i.kind === "PACKING");
  const handledByOther = event.assigneeUserId !== null && event.assigneeUserId !== me.id;
  const place = event.location ?? event.address;
  const detail = paths.events.detail(event.childId, event.id);

  return (
    <div className={cn("relative overflow-hidden flex flex-col gap-2 p-4 rounded-2xl border shadow-[0_1px_6px_rgba(0,0,0,0.02)]", tone.eventCard)}>
      {category && (
        <Icon
          name={category.icon}
          className={cn("absolute -bottom-4 -right-3 text-[100px] pointer-events-none select-none leading-none opacity-[0.035]", tone.ink)}
        />
      )}
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 w-full">
            <CategoryChip category={category} />
            <span className="font-label-md text-label-md text-secondary font-semibold shrink-0 ml-auto">
              {event.allDay ? t("event.allDay") : fmt.time(event.startsAt)}
            </span>
          </div>
          <Link to={detail} className={cn("font-headline-sm text-headline-sm text-on-surface font-bold mt-2 tracking-tight", handledByOther && "opacity-40")}>
            {event.title}
          </Link>
          {place && (
            <div className="flex items-center justify-between gap-2 mt-1.5 pt-0.5">
              <div className={cn("flex flex-col text-label-sm text-secondary min-w-0", handledByOther && "opacity-40")}>
                <span className="font-semibold text-on-surface truncate">{place}</span>
                {event.location && event.address && <span className="truncate">{event.address}</span>}
              </div>
              <a
                aria-label={t("event.directions")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-secondary hover:text-on-surface transition-colors shrink-0 shadow-sm"
                href={mapsUrl(event.address ?? place)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Icon name="near_me" className="text-[14px]" />
              </a>
            </div>
          )}

          {todos.length > 0 && (
            <div className="flex flex-col gap-2 mt-3 pt-2.5 border-t border-outline-variant/20">
              {todos.map((item, i) => (
                <label
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2.5 cursor-pointer group select-none",
                    i < todos.length - 1 ? "pb-2 border-b border-outline-variant/20" : "pt-0.5",
                  )}
                >
                  <Checkbox
                    checked={item.isChecked}
                    onCheckedChange={(v) => toggle.mutate({ eventId: event.id, itemId: item.id, isChecked: v === true })}
                    className="size-4 rounded border shadow-sm bg-surface-container-lowest border-outline/30 data-[state=checked]:bg-secondary/40 data-[state=checked]:border-secondary/40"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium leading-none transition-all",
                      item.isChecked ? "line-through opacity-60 text-secondary" : "text-on-surface",
                    )}
                  >
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          )}

          {event.notes && (
            <Link to={detail} className="mt-3 pt-2.5 border-t border-outline-variant/30 flex items-center gap-2 text-secondary">
              <Icon name="description" className="text-[16px] text-secondary" />
              <span className="font-body-md text-sm text-on-surface-variant font-medium leading-none">{t("event.note")}</span>
            </Link>
          )}
          {packing.length > 0 && (
            <Link to={detail} className="mt-3 pt-2.5 border-t border-outline-variant/30 flex items-center gap-2 text-secondary">
              <Icon name="backpack" className="text-[16px] text-secondary" />
              <span className="font-body-md text-sm text-on-surface-variant font-medium leading-none">{t("event.packingList")}</span>
            </Link>
          )}
          {handledByOther && (
            <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center gap-2 text-alert">
              <Icon name="account_circle" className="text-[16px] text-alert" />
              <span className="font-body-md text-sm font-semibold leading-none text-alert">
                {t("event.handledBy", { name: person(findMember(members, event.assigneeUserId)) })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
