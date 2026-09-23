import { useState } from "react";
import type { ChildSummary, ListItemDto, ListItemType } from "@kidcom/shared";
import {
  addDays,
  dateKey,
  paths,
  useActiveChildren,
  useClaimListItem,
  useCurrentUser,
  useFamilies,
  useFormat,
  useLists,
  useNavigate,
  useT,
} from "@kidcom/core";

import { EmptyCard, menuContentClass } from "../calendar/Sections";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";

// kidcom_lists: necessities (or the wishlist) across the selected children —
// how many are claimed, what's still needed ("I'll get it"), and who is
// providing what, with their note.

const TYPE_ICON: Record<ListItemType, string> = { NECESSITY: "checklist", WISHLIST: "redeem" };
const TYPE_KEY = "kidcom.listType";

function readType(): ListItemType {
  try {
    return sessionStorage.getItem(TYPE_KEY) === "WISHLIST" ? "WISHLIST" : "NECESSITY";
  } catch {
    return "NECESSITY";
  }
}

export function ListsScreen() {
  const { t } = useT("lists");
  const { filter, selected, children } = useActiveChildren();
  const [type, setTypeState] = useState<ListItemType>(readType);
  const setType = (v: ListItemType) => {
    setTypeState(v);
    try {
      sessionStorage.setItem(TYPE_KEY, v);
    } catch {
      // Not remembered; still applied.
    }
  };
  const { data: items = [], isLoading } = useLists(filter.kind === "all" ? null : selected.map((c) => c.id), type);
  const families = useFamilies(items.map((i) => i.childId));
  const open = items.filter((i) => !i.claimedById);
  const claimed = items.filter((i) => i.claimedById);
  const pct = items.length ? Math.round((claimed.length / items.length) * 100) : 0;
  const kid = (id: string) => children.find((c) => c.id === id);

  return (
    <div className="flex flex-col w-full pb-12">
      <div className="flex items-center justify-between pt-2 pb-space-sm">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{t("title")}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant text-label-sm font-label-md text-on-surface shadow-[0_1px_3px_rgba(0,0,0,0.02)] active:scale-95 transition-all group">
            <Icon name={TYPE_ICON[type]} className="text-[16px]" />
            <span>{t(`types.${type}`)}</span>
            <Icon name="expand_more" className="text-[16px] text-on-surface-variant transition-transform group-data-[state=open]:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className={cn(menuContentClass, "w-44")}>
            {(["NECESSITY", "WISHLIST"] as const).map((v) => (
              <DropdownMenuItem
                key={v}
                role="menuitemradio"
                aria-checked={v === type}
                onSelect={() => setType(v)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-label-sm text-on-surface focus:bg-surface-container-low",
                  v === type ? "font-semibold bg-surface-container-low" : "font-medium",
                )}
              >
                <Icon name={TYPE_ICON[v]} className={cn("text-[16px]", v === type ? "text-primary" : "text-secondary")} />
                {t(`types.${v}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading && <Skeleton className="mt-space-sm h-28 rounded-2xl bg-tertiary-fixed/40" />}

      {!isLoading && items.length === 0 && (
        <div className="mt-space-sm">
          <EmptyCard icon={TYPE_ICON[type]} text={t(`empty.${type}`)} to={`${paths.lists.create()}?type=${type}`} action={t("add")} />
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-space-sm bg-tertiary-fixed/40 rounded-2xl p-space-md shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon name="task_alt" filled className="text-on-tertiary-fixed text-[20px]" />
              <span className="font-title-md text-title-md text-on-tertiary-fixed">
                {t(`progress.${type}`, { claimed: claimed.length, total: items.length })}
              </span>
            </div>
            <span className="font-micro-meta text-micro-meta text-on-tertiary-fixed-variant bg-surface-container-lowest/80 px-2 py-0.5 rounded-full">
              {t("percent", { pct })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t(`progress.${type}`, { claimed: claimed.length, total: items.length })}
            className="w-full h-2 rounded-full bg-surface-container-lowest/70 overflow-hidden mb-2"
          >
            <div className="h-full rounded-full bg-on-tertiary-container transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="font-body-md text-body-md text-on-tertiary-fixed-variant flex items-center gap-1.5 text-xs">
            <Icon name="sync_saved_locally" className="text-[14px]" />
            <span>{t("syncNote")}</span>
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="mt-space-lg flex flex-col gap-space-sm">
          <div className="flex items-center justify-between px-1 w-full">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{t(`needed.${type}`)}</h2>
            <span className="font-micro-meta text-micro-meta bg-error-container text-on-error-container px-2 py-0.5 rounded-full uppercase">
              {t("open", { count: open.length })}
            </span>
          </div>
          {open.map((item) => (
            <NeededCard key={item.id} item={item} child={kid(item.childId)} />
          ))}
        </div>
      )}

      {claimed.length > 0 && (
        <div className="mt-space-lg flex flex-col gap-space-sm">
          <div className="flex items-center justify-between px-1 w-full">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{t(`claimed.${type}`)}</h2>
          </div>
          {claimed.map((item) => (
            <ClaimedCard key={item.id} item={item} child={kid(item.childId)} claimerName={families.get(item.childId)?.find((m) => m.userId === item.claimedById)?.firstName} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-space-xl flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-secondary">
            <Icon name="lock" className="text-[14px]" />
            <span className="font-label-sm text-label-sm">{t("liveNote")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ChildBadge({ child }: { child: ChildSummary | undefined }) {
  return (
    <PersonAvatar
      mediaId={child?.profileImageUrl}
      initials={child?.firstName.charAt(0) ?? "?"}
      className="w-11 h-11 shadow-sm shrink-0"
    />
  );
}

function ItemHeading({ item, child, bold }: { item: ListItemDto; child: ChildSummary | undefined; bold?: boolean }) {
  const { t } = useT("lists");
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(paths.lists.edit(item.childId, item.id))}
      className="flex items-center gap-3 text-left min-w-0"
    >
      <ChildBadge child={child} />
      <div className="min-w-0">
        <h3 className={cn("font-title-md text-title-md text-on-surface truncate", bold && "font-bold")}>{item.title}</h3>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          {item.sizeValue && <span className="font-label-sm text-label-sm text-secondary">{t("size", { size: item.sizeValue })}</span>}
          {item.sizeValue && child && <span className="w-1 h-1 rounded-full bg-outline-variant shrink-0" />}
          {child && <span className="font-label-sm text-label-sm text-secondary truncate">{child.firstName}</span>}
        </div>
      </div>
    </button>
  );
}

function NeededCard({ item, child }: { item: ListItemDto; child: ChildSummary | undefined }) {
  const { t } = useT("lists");
  const fmt = useFormat();
  const claim = useClaimListItem();
  const soon = item.dueOn !== null && item.dueOn <= addDays(dateKey(), 7);
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_4px_18px_rgba(0,0,0,0.03)] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <ItemHeading item={item} child={child} />
      </div>
      <div className="flex items-center justify-between pt-1">
        {item.dueOn ? (
          <span
            className={cn(
              "font-micro-meta text-micro-meta px-2.5 py-1 rounded-full flex items-center gap-1",
              soon ? "bg-error-container/60 text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed",
            )}
          >
            <Icon name={soon ? "alarm" : "wb_sunny"} className="text-[13px]" />
            {fmt.date(`${item.dueOn}T12:00:00Z`, { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate({ item, body: { claimed: true } })}
          className="rounded-full bg-primary text-on-primary px-3.5 py-1.5 font-label-md text-label-md shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:scale-95 transition-transform flex items-center gap-1 disabled:opacity-60"
        >
          <Icon name="check" className="text-[16px]" />
          <span>{t("claim")}</span>
        </button>
      </div>
    </div>
  );
}

function ClaimedCard({ item, child, claimerName }: { item: ListItemDto; child: ChildSummary | undefined; claimerName: string | undefined }) {
  const { t } = useT("lists");
  const fmt = useFormat();
  const me = useCurrentUser();
  const claim = useClaimListItem();
  const [noteOpen, setNoteOpen] = useState(false);
  const mine = item.claimedById === me.id;
  const who = mine ? t("providingYou") : t("providing", { name: claimerName ?? item.claimedByName?.split(" ")[0] ?? t("someone") });

  return (
    <div className="rounded-[24px] p-4 flex flex-col gap-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] bg-surface-container-low">
      <div className="flex items-start justify-between">
        <ItemHeading item={item} child={child} bold />
      </div>
      <div className="p-2.5 bg-surface-container-lowest/90 flex flex-col gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[8px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PersonAvatar
              mediaId={mine ? me.avatarUrl : item.claimedByAvatarUrl}
              initials={(item.claimedByName ?? "?").split(" ").map((p) => p.charAt(0)).join("").slice(0, 2)}
              className="w-8 h-8 shadow-sm"
            />
            <div className="min-w-0">
              <p className="font-label-md text-label-md text-on-surface truncate">{who}</p>
              {item.claimedAt && (
                <p className="font-label-sm text-label-sm text-secondary">{fmt.date(item.claimedAt, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
              )}
            </div>
          </div>
          {mine && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" aria-label={t("editNote")} onClick={() => setNoteOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container">
                <Icon name="edit_note" className="text-[18px]" />
              </button>
              <button
                type="button"
                aria-label={t("release")}
                disabled={claim.isPending}
                onClick={() => claim.mutate({ item, body: { claimed: false } })}
                className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container"
              >
                <Icon name="undo" className="text-[18px]" />
              </button>
            </div>
          )}
        </div>
        {item.claimNote && (
          <div className="bg-surface-container-lowest/80 p-2.5 rounded-lg flex items-start gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <Icon name="receipt_long" className="text-[16px] text-on-surface-variant mt-0.5" />
            <p className="font-body-md text-body-md text-on-surface-variant text-xs leading-relaxed">{t("quoted", { note: item.claimNote })}</p>
          </div>
        )}
        {mine && !item.claimNote && (
          <button type="button" onClick={() => setNoteOpen(true)} className="self-start font-label-sm text-label-sm text-on-surface underline decoration-secondary underline-offset-4">
            {t("addNote")}
          </button>
        )}
      </div>
      {mine && <NoteSheet item={item} open={noteOpen} onOpenChange={setNoteOpen} />}
    </div>
  );
}

function NoteSheet({ item, open, onOpenChange }: { item: ListItemDto; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT("lists");
  const claim = useClaimListItem();
  const [note, setNote] = useState(item.claimNote ?? "");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t("noteTitle")}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">{t("noteHint", { title: item.title })}</SheetDescription>
        </SheetHeader>
        <Textarea aria-label={t("noteTitle")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate({ item, body: { note: note.trim() || null } }, { onSuccess: () => onOpenChange(false) })}
          className="mt-space-md w-full py-3.5 px-5 rounded-full bg-primary text-on-primary font-label-md text-label-md font-medium disabled:opacity-60"
        >
          {t("saveNote")}
        </button>
      </SheetContent>
    </Sheet>
  );
}

