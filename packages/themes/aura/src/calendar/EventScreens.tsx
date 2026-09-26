import { useState, type FormEvent } from "react";
import type { CalendarEventDto, CreateCalendarEventRequest } from "@kinnd/shared";
import {
  copenhagenInstant,
  dateKey,
  Link,
  paths,
  timeKey,
  useActiveChildren,
  useCalendarEvent,
  useCategoryMap,
  useChildFamily,
  useCreateEvent,
  useCurrentUser,
  useDeleteEvent,
  useFormat,
  useNavigate,
  useParams,
  useSearchParams,
  useT,
  useToggleChecklistItem,
  useUpdateEvent,
} from "@kinnd/core";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import {
  CategoriesField,
  ChildField,
  DateField,
  EditorTitle,
  Field,
  FormCard,
  FormError,
  LabelListField,
  PrimaryButton,
  SecondaryButton,
} from "../components/Form";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { CategoryChip } from "./CategoryChip";
import { mapsUrl } from "./EventCard";
import { findMember, usePersonName } from "./people";
import { toneOf } from "./tones";

// Event detail and create/edit. No Stitch export: built from the event card
// (kinnd_calendar_1-3) and DESIGN.md form parts.

const NONE = "none";

export function EventDetailScreen() {
  const { t } = useT("calendar");
  const fmt = useFormat();
  const me = useCurrentUser();
  const person = usePersonName();
  const navigate = useNavigate();
  const { childId, eventId } = useParams();
  const { data: event, isLoading, refetch } = useCalendarEvent(childId, eventId);
  const { data: members = [] } = useChildFamily(childId);
  const categories = useCategoryMap();
  const toggle = useToggleChecklistItem(childId ?? "");
  const remove = useDeleteEvent(childId ?? "");
  const [confirming, setConfirming] = useState(false);

  if (isLoading || !event || !childId) {
    return <EditorTitle>{isLoading ? t("common:loading") : t("event.notFound")}</EditorTitle>;
  }

  // The first category leads (card tone, watermark); all of them show as pills.
  const eventCategories = event.categoryIds.flatMap((id) => categories.get(id) ?? []);
  const category = eventCategories[0];
  const tone = toneOf(category?.tone);
  const todos = event.checklist.filter((i) => i.kind === "TASK");
  const packing = event.checklist.filter((i) => i.kind === "PACKING");
  const place = event.location ?? event.address;
  const when = event.allDay
    ? `${fmt.weekdayDate(event.startsAt)} · ${t("event.allDay")}`
    : `${fmt.weekdayDate(event.startsAt)} · ${fmt.time(event.startsAt)}${event.endsAt ? `–${fmt.time(event.endsAt)}` : ""}`;

  const checklist = (items: typeof todos, title: string, icon: string) =>
    items.length > 0 && (
      <FormCard className="gap-2">
        <div className="flex items-center gap-2">
          <Icon name={icon} className="text-[18px] text-secondary" />
          <span className="font-title-md text-title-md text-on-surface font-semibold">{title}</span>
        </div>
        <div className="flex flex-col divide-y divide-outline-variant/20">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2.5 py-3 cursor-pointer select-none">
              <Checkbox
                checked={item.isChecked}
                onCheckedChange={(v) =>
                  toggle.mutate({ eventId: event.id, itemId: item.id, isChecked: v === true }, { onSettled: () => void refetch() })
                }
                className="size-4 rounded border shadow-sm bg-surface-container-lowest border-outline/30 data-[state=checked]:bg-secondary/40 data-[state=checked]:border-secondary/40"
              />
              <span className={cn("text-sm font-medium leading-none", item.isChecked ? "line-through opacity-60 text-secondary" : "text-on-surface")}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </FormCard>
    );

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("event.detailTitle")}</EditorTitle>

      <div className={cn("relative overflow-hidden flex flex-col gap-2 p-5 rounded-[28px] border shadow-[0_1px_6px_rgba(0,0,0,0.02)]", tone.eventCard)}>
        {category && (
          <Icon name={category.icon} className={cn("absolute -bottom-4 -right-3 text-[100px] pointer-events-none select-none leading-none opacity-[0.035]", tone.ink)} />
        )}
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {eventCategories.length ? eventCategories.map((c) => <CategoryChip key={c.id} category={c} className="w-fit" />) : <CategoryChip category={undefined} className="w-fit" />}
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">{event.title}</h1>
          <span className="font-label-md text-label-md text-secondary font-semibold">{when}</span>
          {place && (
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <div className="flex flex-col text-label-sm text-secondary min-w-0">
                <span className="font-semibold text-on-surface">{place}</span>
                {event.location && event.address && <span>{event.address}</span>}
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
          {event.assigneeUserId && (
            <div
              className={cn(
                "mt-2 pt-2 border-t border-outline-variant/20 flex items-center gap-2",
                event.assigneeUserId === me.id ? "text-secondary" : "text-alert",
              )}
            >
              <Icon name="account_circle" className="text-[16px]" />
              <span className="font-body-md text-sm font-semibold leading-none">
                {event.assigneeUserId === me.id ? t("event.handledByYou") : t("event.handledBy", { name: person(findMember(members, event.assigneeUserId)) })}
              </span>
            </div>
          )}
        </div>
      </div>

      {event.notes && (
        <FormCard className="gap-2">
          <div className="flex items-center gap-2">
            <Icon name="description" className="text-[18px] text-secondary" />
            <span className="font-title-md text-title-md text-on-surface font-semibold">{t("event.note")}</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">{event.notes}</p>
        </FormCard>
      )}
      {checklist(todos, t("event.todos"), "checklist")}
      {checklist(packing, t("event.packingList"), "backpack")}

      {event.editable && (
        <div className="flex flex-col gap-2">
          <Link
            to={paths.events.edit(childId, event.id)}
            className="w-full py-3.5 px-5 rounded-full bg-primary text-on-primary flex items-center justify-center gap-2 font-label-md text-label-md font-medium shadow-sm"
          >
            <Icon name="edit" className="text-[18px]" />
            {t("event.edit")}
          </Link>
          <SecondaryButton
            icon="delete"
            className="text-error"
            disabled={remove.isPending}
            onClick={() => setConfirming(true)}
          >
            {t("event.delete")}
          </SecondaryButton>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("event.confirmDeleteTitle")}
            body={t(event.recurrenceIntervalWeeks ? "event.confirmDeleteSeries" : "event.confirmDelete")}
            confirmLabel={t("event.delete")}
            pending={remove.isPending}
            onConfirm={() => remove.mutate(event.id, { onSuccess: () => navigate(paths.calendar.agenda(), { replace: true }) })}
          />
        </div>
      )}
    </div>
  );
}

type Draft = {
  childId: string;
  title: string;
  categoryIds: string[];
  day: string;
  allDay: boolean;
  start: string;
  end: string;
  location: string;
  address: string;
  assignee: string;
  notes: string;
  todos: string[];
  packing: string[];
  repeat: string;
};

function draftFrom(e: CalendarEventDto): Draft {
  return {
    childId: e.childId,
    title: e.title,
    categoryIds: e.categoryIds,
    day: dateKey(e.startsAt),
    allDay: e.allDay,
    start: e.allDay ? "09:00" : timeKey(e.startsAt),
    end: e.endsAt && !e.allDay ? timeKey(e.endsAt) : "",
    location: e.location ?? "",
    address: e.address ?? "",
    assignee: e.assigneeUserId ?? NONE,
    notes: e.notes ?? "",
    todos: e.checklist.filter((i) => i.kind === "TASK").map((i) => i.label),
    packing: e.checklist.filter((i) => i.kind === "PACKING").map((i) => i.label),
    repeat: e.recurrenceIntervalWeeks ? String(e.recurrenceIntervalWeeks) : NONE,
  };
}

export function EventEditScreen() {
  const { t } = useT("calendar");
  const { childId: routeChild, eventId } = useParams();
  const { data: existing, isLoading } = useCalendarEvent(routeChild, eventId);
  if (eventId && !existing) return <EditorTitle>{t(isLoading ? "common:loading" : "event.notFound")}</EditorTitle>;
  return <EventForm key={existing?.id ?? "new"} existing={existing} />;
}

const blankDraft = (childId: string, day: string): Draft => ({
  childId,
  title: "",
  categoryIds: [],
  day,
  allDay: false,
  start: "09:00",
  end: "",
  location: "",
  address: "",
  assignee: NONE,
  notes: "",
  todos: [],
  packing: [],
  repeat: NONE,
});

function EventForm({ existing }: { existing?: CalendarEventDto }) {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { children: kids, selected } = useActiveChildren();
  const editing = Boolean(existing);
  const eventId = existing?.id;
  const [draft, setDraft] = useState<Draft>(() =>
    existing ? draftFrom(existing) : blankDraft(params.get("child") ?? selected[0]?.id ?? "", params.get("date") ?? dateKey()),
  );
  // On a cold start the children arrive after the first render.
  const childId = draft.childId || kids[0]?.id || "";

  const { data: members = [] } = useChildFamily(childId || undefined);
  const create = useCreateEvent(childId);
  const update = useUpdateEvent(childId);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!draft.title.trim()) return setError(t("form.titleRequired"));
    if (!draft.allDay && draft.end && draft.end <= draft.start) return setError(t("form.endAfterStart"));

    const checklist = [
      ...draft.todos.filter((x) => x.trim()).map((label) => ({ label: label.trim(), kind: "TASK" as const })),
      ...draft.packing.filter((x) => x.trim()).map((label) => ({ label: label.trim(), kind: "PACKING" as const })),
    ];
    const original = existing ? draftFrom(existing) : null;
    const checklistChanged =
      !original || JSON.stringify([original.todos, original.packing]) !== JSON.stringify([draft.todos, draft.packing]);

    const body: CreateCalendarEventRequest = {
      title: draft.title.trim(),
      categoryIds: draft.categoryIds,
      allDay: draft.allDay,
      startsAt: copenhagenInstant(draft.day, draft.allDay ? "00:00" : draft.start),
      ...(draft.allDay || !draft.end ? {} : { endsAt: copenhagenInstant(draft.day, draft.end) }),
      notes: draft.notes.trim(),
      location: draft.location.trim(),
      address: draft.address.trim(),
      assigneeUserId: draft.assignee === NONE ? null : draft.assignee,
      recurrenceIntervalWeeks: draft.repeat === NONE ? null : Number(draft.repeat),
      ...(checklistChanged ? { checklist } : {}),
    };
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : t("form.saveFailed"));
    if (editing && eventId) {
      update.mutate({ eventId, body }, { onSuccess: () => navigate(paths.events.detail(childId, eventId), { replace: true }), onError });
    } else {
      create.mutate(body, { onSuccess: (ev) => navigate(paths.events.detail(childId, ev.id), { replace: true }), onError });
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="flex flex-col w-full pb-6 gap-space-lg" noValidate>
      <EditorTitle>{t(editing ? "event.editTitle" : "event.createTitle")}</EditorTitle>

      <FormCard>
        {!editing && <ChildField kids={kids} value={childId} onChange={(v) => set("childId", v)} />}
        <Field id="title" label={t("form.title")}>
          <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={t("form.eventTitlePlaceholder")} />
        </Field>
        <CategoriesField value={draft.categoryIds} onChange={(v) => set("categoryIds", v)} />
      </FormCard>

      <FormCard>
        <DateField id="day" label={t("form.date")} value={draft.day} onChange={(v) => set("day", v)} />
        <label className="flex items-center justify-between gap-3">
          <span className="font-label-md text-label-md text-on-surface">{t("form.allDay")}</span>
          <Switch checked={draft.allDay} onCheckedChange={(v) => set("allDay", v)} />
        </label>
        {!draft.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="start" label={t("form.start")}>
              <Input id="start" type="time" value={draft.start} onChange={(e) => set("start", e.target.value)} />
            </Field>
            <Field id="end" label={t("form.end")}>
              <Input id="end" type="time" value={draft.end} onChange={(e) => set("end", e.target.value)} />
            </Field>
          </div>
        )}
        <Field id="repeat" label={t("form.repeat")}>
          <Select value={draft.repeat} onValueChange={(v) => set("repeat", v)}>
            <SelectTrigger id="repeat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("form.repeatNever")}</SelectItem>
              <SelectItem value="1">{t("form.repeatWeekly")}</SelectItem>
              <SelectItem value="2">{t("form.repeatBiweekly")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormCard>

      <FormCard>
        <Field id="location" label={t("form.place")}>
          <Input id="location" value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder={t("form.placePlaceholder")} />
        </Field>
        <Field id="address" label={t("form.address")}>
          <Input id="address" value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder={t("form.addressPlaceholder")} />
        </Field>
        <Field id="assignee" label={t("form.handledBy")}>
          <Select value={draft.assignee} onValueChange={(v) => set("assignee", v)}>
            <SelectTrigger id="assignee" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("form.nobody")}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.firstName} {m.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="notes" label={t("event.note")}>
          <Textarea id="notes" value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormCard>

      <FormCard>
        <LabelListField label={t("event.todos")} items={draft.todos} onChange={(v) => set("todos", v)} placeholder={t("form.addTodo")} />
        <LabelListField label={t("event.packingList")} items={draft.packing} onChange={(v) => set("packing", v)} placeholder={t("form.addPackingItem")} />
      </FormCard>

      <FormError message={error} />
      <PrimaryButton icon="check" disabled={pending || !childId}>
        {t(editing ? "form.saveChanges" : "event.create")}
      </PrimaryButton>
    </form>
  );
}
