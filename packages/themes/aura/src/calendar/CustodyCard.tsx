import { useState } from "react";
import type { ChildOverview } from "@kidcom/shared";
import { Link, paths, useFormat, useSetPacking, useT, useTogglePacking } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { findMember, usePersonName } from "./people";

// The custody card ("MOM’S — Day 7 — DAD’S") from
// kidcom_today_screen_updated_note (variant "today": roomier, Request Swap
// inside) and kidcom_calendar_1-3 (variant "calendar").

function Arc() {
  return (
    <svg className="w-full h-8 overflow-visible" fill="none" viewBox="0 0 140 24" aria-hidden="true">
      <path d="M 4 18 Q 70 2 136 18" opacity="0.35" stroke="#55615d" strokeDasharray="3.5 3.5" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

export function CustodyCard({ child, variant, childName }: { child: ChildOverview; variant: "today" | "calendar"; childName?: string }) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const person = usePersonName();
  const [packingOpen, setPackingOpen] = useState(false);
  const today = child.custody.today;
  const today_ = variant === "today";

  if (!today) {
    return (
      <section className="relative bg-secondary-container text-on-secondary-fixed p-6 rounded-3xl overflow-hidden shadow-sm flex flex-col gap-3">
        {childName && <span className="font-micro-meta text-micro-meta uppercase tracking-wider text-secondary">{childName}</span>}
        <span className="font-title-md text-title-md text-on-secondary-fixed">{t("custody.noPlanTitle")}</span>
        <p className="font-body-md text-body-md text-secondary">{t(child.can.editCustody ? "custody.noPlanBodyEditor" : "custody.noPlanBody")}</p>
      </section>
    );
  }

  const holder = findMember(child.members, today.holderUserId);
  const next = today.nextHandover;
  const nextHolder = next ? findMember(child.members, next.toUserId) : undefined;
  const until = next
    ? next.time
      ? t("custody.untilWithTime", { day: fmt.date(`${next.date}T12:00:00Z`, { weekday: "short" }), time: next.time })
      : t("custody.until", { day: fmt.date(`${next.date}T12:00:00Z`, { weekday: "short" }) })
    : null;
  const packed = child.packing.items.filter((i) => i.packed).length;

  return (
    <section
      className={cn(
        "relative bg-secondary-container text-on-secondary-fixed overflow-hidden flex flex-col",
        today_ ? "p-6 rounded-3xl shadow-sm gap-4" : "rounded-[30px] p-5 shadow-[0_8px_24px_-8px_rgba(22,26,24,0.08)] gap-5",
      )}
    >
      {childName && <span className="font-micro-meta text-micro-meta uppercase tracking-wider text-secondary -mb-2">{childName}</span>}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex flex-col min-w-0">
          <span className="font-headline-sm text-headline-sm text-on-secondary-fixed font-bold tracking-tight uppercase">
            {t("custody.possessive", { name: person(holder) })}
          </span>
          {until && <span className="font-label-sm text-label-sm text-secondary truncate mt-0.5">{until}</span>}
        </div>
        <div className="flex-1 flex flex-col items-center px-1">
          <div className="relative w-full flex items-center justify-center">
            <Arc />
            <div className="absolute -top-1 px-2 py-0.5 rounded-full bg-surface-container-lowest text-on-secondary-fixed shadow-[0_2px_6px_rgba(0,0,0,0.06)] flex items-center gap-1">
              <Icon name="transfer_within_a_station" className="text-[14px] text-secondary" />
              <span className="font-micro-meta text-micro-meta uppercase">{t("custody.day", { day: today.dayOfBlock })}</span>
            </div>
          </div>
          <span className={cn("font-micro-meta text-micro-meta text-secondary tracking-wide uppercase mt-1", today_ && "font-bold")}>
            {t("custody.today")}
          </span>
        </div>
        {next && (
          <div className="flex flex-col items-end min-w-0 text-right">
            <span className="font-headline-sm text-headline-sm text-on-secondary-fixed font-bold tracking-tight uppercase">
              {t("custody.possessive", { name: person(nextHolder) })}
            </span>
            {next.location && <span className="font-label-sm text-label-sm text-secondary truncate mt-0.5">{next.location}</span>}
          </div>
        )}
      </div>

      {(child.packing.items.length > 0 || child.can.editCustody) && (
        <div
          className={cn(
            "flex items-center justify-between backdrop-blur-md rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)]",
            today_ ? "bg-surface-container-lowest/80 p-4" : "bg-surface-container-lowest/70 p-3.5 pt-3",
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-fixed shrink-0",
                today_ ? "w-10 h-10" : "w-8 h-8",
              )}
            >
              <Icon name="backpack" className={today_ ? "text-[20px]" : "text-[18px]"} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={cn("font-label-md text-label-md text-on-surface truncate", today_ && "font-semibold")}>{t("packing.title")}</span>
              <span className="font-label-sm text-label-sm text-secondary">
                {child.packing.items.length ? t("packing.progress", { packed, total: child.packing.items.length }) : t("packing.empty")}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("packing.open")}
            onClick={() => setPackingOpen(true)}
            className={cn(
              "rounded-full bg-primary text-on-primary flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:scale-95 transition-transform shrink-0",
              today_ ? "w-10 h-10" : "w-9 h-9",
            )}
          >
            <Icon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      )}

      {today_ && child.can.requestSwap && (
        <Link
          to={`${paths.swapRequest()}?child=${encodeURIComponent(child.childId)}`}
          className="w-full py-3.5 px-5 rounded-full bg-primary text-on-primary flex items-center justify-center gap-2 font-label-md text-label-md transition-transform active:scale-95 shadow-sm hover:opacity-90 font-medium"
        >
          <Icon name="sync_alt" className="text-[18px]" />
          <span>{t("swap.request")}</span>
        </Link>
      )}

      <PackingSheet child={child} open={packingOpen} onOpenChange={setPackingOpen} />
    </section>
  );
}

/** The handover packing checklist (no export shows it; built from DESIGN.md parts). */
function PackingSheet({ child, open, onOpenChange }: { child: ChildOverview; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const toggle = useTogglePacking(child.childId);
  const save = useSetPacking(child.childId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; label: string }[]>([]);
  const [newItem, setNewItem] = useState("");
  const canEdit = child.can.editCustody;

  const startEditing = () => {
    setDraft(child.packing.items.map((i) => ({ id: i.id, label: i.label })));
    setEditing(true);
  };
  const commit = () =>
    save.mutate(
      { items: [...draft, ...(newItem.trim() ? [{ label: newItem.trim() }] : [])].filter((i) => i.label.trim()) },
      { onSuccess: () => { setEditing(false); setNewItem(""); } },
    );

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setEditing(false); }}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg max-h-[85vh] overflow-y-auto">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t("packing.title")}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">
            {child.packing.forDate ? t("packing.forHandover", { date: fmt.weekdayDate(`${child.packing.forDate}T12:00:00Z`) }) : null}
          </SheetDescription>
        </SheetHeader>

        {editing ? (
          <div className="flex flex-col gap-2">
            {draft.map((item, i) => (
              <div key={item.id ?? `new-${i}`} className="flex items-center gap-2">
                <Input
                  aria-label={t("packing.itemLabel")}
                  value={item.label}
                  onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, label: e.target.value } : d)))}
                />
                <button
                  type="button"
                  aria-label={t("packing.remove")}
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                  className="w-10 h-10 shrink-0 rounded-full bg-surface-container-low text-secondary flex items-center justify-center"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              </div>
            ))}
            <Input placeholder={t("packing.addPlaceholder")} value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 h-12 rounded-full bg-surface-container text-on-surface font-label-md text-label-md">
                {t("common:cancel")}
              </button>
              <button type="button" disabled={save.isPending} onClick={commit} className="flex-1 h-12 rounded-full bg-primary text-on-primary font-label-md text-label-md disabled:opacity-60">
                {t("common:save")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {child.packing.items.length === 0 && <p className="font-body-md text-body-md text-secondary">{t("packing.emptyLong")}</p>}
            <ul className="flex flex-col divide-y divide-outline-variant/20">
              {child.packing.items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-3 py-3 cursor-pointer select-none">
                    <Checkbox checked={item.packed} onCheckedChange={(v) => toggle.mutate({ itemId: item.id, packed: v === true })} />
                    <span className={cn("font-body-md text-body-md", item.packed ? "line-through text-secondary opacity-60" : "text-on-surface")}>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            {canEdit && (
              <button type="button" onClick={startEditing} className="self-start inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface underline decoration-secondary underline-offset-4">
                <Icon name="edit" className="text-[16px]" />
                {t("packing.edit")}
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
