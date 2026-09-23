import { useState, type FormEvent } from "react";
import type { EmergencyContactCategory, EmergencyContactDto, MedicalInfoCategory, MedicalInfoEntry } from "@kidcom/shared";
import {
  dateKey,
  Link,
  paths,
  useAddGrowthEntry,
  useChild,
  useDeleteEmergencyContact,
  useDeleteGrowthEntry,
  useDeleteMedicalInfo,
  useEmergencyContacts,
  useFormat,
  useGrowthEntries,
  useMedicalInfo,
  useParams,
  useSaveEmergencyContact,
  useSaveMedicalInfo,
  useSearchParams,
  useT,
} from "@kidcom/core";

import { EmptyCard, SectionHeader } from "../calendar/Sections";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DateField, EditorTitle, Field, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { Input } from "../ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Textarea } from "../ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { GrowthChart, summarizeGrowth } from "./growth";

// Medical info, contacts and growth (no Stitch exports; DESIGN.md cards,
// rows and sheets like the profile's Care & Essentials).

const listCard = "rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 flex flex-col divide-y divide-outline-variant/20";
const sheetClass = "rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg max-h-[90vh] overflow-y-auto";
const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

// ---------------------------------------------------------------------------
// Medical info
// ---------------------------------------------------------------------------

export function MedicalScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: child } = useChild(childId);
  const { data: items, isError } = useMedicalInfo(childId);
  const [editing, setEditing] = useState<MedicalInfoEntry | "new" | null>(null);
  const canEdit = child?.myRole === "PARENT" || child?.myRole === "GUARDIAN";
  if (!childId) return null;
  const allergies = (items ?? []).filter((i) => i.category === "ALLERGY");
  const conditions = (items ?? []).filter((i) => i.category === "CONDITION");

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("medical.title")}</EditorTitle>

      <Link to={paths.children.health(childId)} className="p-space-md rounded-[24px] bg-mint shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center text-on-secondary-fixed">
            <Icon name="vaccines" className="text-[20px]" />
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface font-bold">{t("medical.timeline")}</span>
            <span className="font-label-sm text-label-sm text-secondary">{t("medical.timelineHint")}</span>
          </div>
        </div>
        <Icon name="chevron_right" className="text-secondary text-[20px]" />
      </Link>

      {isError ? (
        <EmptyCard icon="lock" text={t("medical.noAccess")} />
      ) : (
        <>
          {[
            { title: t("medical.allergies"), list: allergies, icon: "allergy" },
            { title: t("medical.conditions"), list: conditions, icon: "medical_information" },
          ].map((group) => (
            <section key={group.title} className="flex flex-col gap-3">
              <SectionHeader title={group.title} count={String(group.list.length)} />
              {group.list.length === 0 ? (
                <p className="font-body-md text-body-md text-secondary px-1">{t("medical.none")}</p>
              ) : (
                <div className={listCard}>
                  {group.list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setEditing(m)}
                      className="flex items-start gap-3 py-3 first:pt-1 last:pb-1 text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-error-container/60 text-on-error-container flex items-center justify-center shrink-0">
                        <Icon name={group.icon} className="text-[18px]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-bold">{m.condition}</span>
                        {m.description && <span className="font-body-md text-sm text-on-surface-variant">{m.description}</span>}
                        {m.emergencyNote && (
                          <span className="mt-1 inline-flex items-center gap-1 font-label-sm text-label-sm text-alert">
                            <Icon name="emergency" className="text-[14px]" />
                            {m.emergencyNote}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
          {canEdit && (
            <PrimaryButton type="button" icon="add" onClick={() => setEditing("new")}>
              {t("medical.add")}
            </PrimaryButton>
          )}
          <p className="font-label-sm text-label-sm text-secondary text-center flex items-center justify-center gap-1.5">
            <Icon name="lock" className="text-[14px]" />
            {t("medical.privacy")}
          </p>
        </>
      )}
      {editing && <MedicalSheet childId={childId} entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MedicalSheet({ childId, entry, onClose }: { childId: string; entry: MedicalInfoEntry | null; onClose: () => void }) {
  const { t } = useT("children");
  const save = useSaveMedicalInfo(childId);
  const remove = useDeleteMedicalInfo(childId);
  const [category, setCategory] = useState<MedicalInfoCategory>(entry?.category ?? "ALLERGY");
  const [condition, setCondition] = useState(entry?.condition ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [emergency, setEmergency] = useState(entry?.emergencyNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!condition.trim()) return setError(t("medical.nameRequired"));
    save.mutate(
      { id: entry?.id, body: { category, condition: condition.trim(), description: description.trim() || undefined, emergencyNote: emergency.trim() || undefined } },
      { onSuccess: onClose, onError: (err) => setError(err instanceof Error ? err.message : t("edit.failed")) },
    );
  };
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className={sheetClass}>
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t(entry ? "medical.editTitle" : "medical.add")}</SheetTitle>
          <SheetDescription className="sr-only">{t("medical.title")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <ToggleGroup type="single" spacing={1} value={category} onValueChange={(v) => v && setCategory(v as MedicalInfoCategory)} className={segmentedGroup} aria-label={t("medical.kind")}>
            {(["ALLERGY", "CONDITION"] as const).map((c) => (
              <ToggleGroupItem key={c} value={c} variant="segmented" className="flex-1 h-9">
                {t(`medical.kinds.${c}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Field id="condition" label={t("medical.name")}>
            <Input id="condition" value={condition} maxLength={200} onChange={(e) => setCondition(e.target.value)} placeholder={t(category === "ALLERGY" ? "medical.allergyPlaceholder" : "medical.conditionPlaceholder")} />
          </Field>
          <Field id="description" label={t("medical.description")}>
            <Textarea id="description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field id="emergency" label={t("medical.emergency")} hint={t("medical.emergencyHint")}>
            <Input id="emergency" value={emergency} maxLength={500} onChange={(e) => setEmergency(e.target.value)} />
          </Field>
          <FormError message={error} />
          <PrimaryButton icon="check" disabled={save.isPending}>{t("edit.save")}</PrimaryButton>
          {entry && (
            <SecondaryButton icon="delete" className="text-error" disabled={remove.isPending} onClick={() => remove.mutate(entry.id, { onSuccess: onClose })}>
              {t("medical.delete")}
            </SecondaryButton>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function ContactsScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: child } = useChild(childId);
  const { data: contacts = [] } = useEmergencyContacts(childId);
  const [editing, setEditing] = useState<EmergencyContactDto | "new" | null>(null);
  const canEdit = child?.myRole !== "FAMILY";
  if (!childId) return null;
  const groups: { key: EmergencyContactCategory; list: EmergencyContactDto[] }[] = (["FAMILY", "MEDICAL", "OTHER"] as const).map((key) => ({
    key,
    list: contacts.filter((c) => c.category === key),
  }));

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("contacts.title")}</EditorTitle>
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.key} className="flex flex-col gap-3">
              <SectionHeader title={t(`contacts.groups.${g.key}`)} count={String(g.list.length)} />
              <div className={listCard}>
                {g.list.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
                    <button type="button" disabled={c.derived || !canEdit} onClick={() => setEditing(c)} className="flex items-center gap-3 min-w-0 text-left">
                      <PersonAvatar mediaId={c.avatarUrl} initials={c.name.split(" ").map((p) => p.charAt(0)).join("").slice(0, 2)} className="w-10 h-10 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-label-md text-label-md text-on-surface font-bold truncate">{c.name}</span>
                        <span className="font-micro-meta text-micro-meta text-secondary truncate">{[c.role, c.location].filter(Boolean).join(" • ")}</span>
                      </div>
                    </button>
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/\s/g, "")}`} aria-label={t("contacts.call", { name: c.name })} className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0">
                        <Icon name="call" className="text-[18px]" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ),
      )}
      {contacts.length === 0 && <EmptyCard icon="call" text={t("contacts.empty")} />}
      {canEdit && (
        <PrimaryButton type="button" icon="add" onClick={() => setEditing("new")}>
          {t("contacts.add")}
        </PrimaryButton>
      )}
      {editing && <ContactSheet childId={childId} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContactSheet({ childId, contact, onClose }: { childId: string; contact: EmergencyContactDto | null; onClose: () => void }) {
  const { t } = useT("children");
  const save = useSaveEmergencyContact(childId);
  const remove = useDeleteEmergencyContact(childId);
  const [category, setCategory] = useState<"MEDICAL" | "OTHER">(contact?.category === "OTHER" ? "OTHER" : "MEDICAL");
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [location, setLocation] = useState(contact?.location ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !phone.trim()) return setError(t("contacts.required"));
    save.mutate(
      { id: contact?.id, body: { category, name: name.trim(), role: role.trim(), phone: phone.trim(), ...(location.trim() ? { location: location.trim() } : {}) } },
      { onSuccess: onClose, onError: (err) => setError(err instanceof Error ? err.message : t("edit.failed")) },
    );
  };
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className={sheetClass}>
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t(contact ? "contacts.editTitle" : "contacts.add")}</SheetTitle>
          <SheetDescription className="sr-only">{t("contacts.title")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <ToggleGroup type="single" spacing={1} value={category} onValueChange={(v) => v && setCategory(v as "MEDICAL" | "OTHER")} className={segmentedGroup} aria-label={t("contacts.kind")}>
            {(["MEDICAL", "OTHER"] as const).map((c) => (
              <ToggleGroupItem key={c} value={c} variant="segmented" className="flex-1 h-9">
                {t(`contacts.groups.${c}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Field id="name" label={t("contacts.name")}>
            <Input id="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("contacts.namePlaceholder")} />
          </Field>
          <Field id="role" label={t("contacts.role")}>
            <Input id="role" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder={t("contacts.rolePlaceholder")} />
          </Field>
          <Field id="phone" label={t("contacts.phone")}>
            <Input id="phone" type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field id="location" label={t("contacts.location")}>
            <Input id="location" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <FormError message={error} />
          <PrimaryButton icon="check" disabled={save.isPending}>{t("edit.save")}</PrimaryButton>
          {contact && (
            <>
              <SecondaryButton icon="delete" className="text-error" onClick={() => setConfirming(true)}>
                {t("contacts.delete")}
              </SecondaryButton>
              <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t("contacts.confirmDelete", { name: contact.name })}
                confirmLabel={t("contacts.delete")}
                pending={remove.isPending}
                onConfirm={() => remove.mutate(contact.id, { onSuccess: onClose })}
              />
            </>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export function GrowthScreen() {
  const { t } = useT("children");
  const fmt = useFormat();
  const { childId } = useParams();
  const [params] = useSearchParams();
  const { data: child } = useChild(childId);
  const { data: entries = [] } = useGrowthEntries(childId);
  const remove = useDeleteGrowthEntry(childId ?? "");
  const [adding, setAdding] = useState(params.get("add") === "1");
  if (!childId || !child) return <EditorTitle>{t("growth.title")}</EditorTitle>;
  const summary = summarizeGrowth(entries, child.birthday, child.gender);
  const sorted = [...entries].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("growth.title")}</EditorTitle>
      <div className="rounded-lg p-space-md flex flex-col gap-space-sm bg-mint border border-secondary-fixed-dim/60">
        <p className="font-body-md text-body-md text-secondary">{t("growth.subtitle")}</p>
        <GrowthChart summary={summary} gender={child.gender} />
      </div>
      {child.canEdit && (
        <PrimaryButton type="button" icon="add" onClick={() => setAdding(true)}>
          {t("growth.add")}
        </PrimaryButton>
      )}
      <section className="flex flex-col gap-3">
        <SectionHeader title={t("growth.history")} count={String(entries.length)} />
        {sorted.length === 0 ? (
          <p className="font-body-md text-body-md text-secondary px-1">{t("growth.empty")}</p>
        ) : (
          <div className={listCard}>
            {sorted.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface font-bold">{fmt.date(e.measuredAt)}</span>
                  {e.note && <span className="font-label-sm text-label-sm text-secondary">{e.note}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-title-md text-title-md text-on-surface">
                    {[e.heightCm !== null && `${fmt.number(e.heightCm)} cm`, e.weightKg !== null && `${fmt.number(e.weightKg)} kg`].filter(Boolean).join(" · ")}
                  </span>
                  {child.canEdit && (
                    <button type="button" aria-label={t("growth.delete")} onClick={() => remove.mutate(e.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container">
                      <Icon name="delete" className="text-[16px]" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {adding && <GrowthSheet childId={childId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function GrowthSheet({ childId, onClose }: { childId: string; onClose: () => void }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const add = useAddGrowthEntry(childId);
  const [day, setDay] = useState(dateKey());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const num = (v: string) => (v.trim() ? fmt.parseNumber(v) : undefined);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const h = num(height);
    const w = num(weight);
    if (h === undefined && w === undefined) return setError(t("growth.required"));
    if ((h !== undefined && !(h > 30 && h < 230)) || (w !== undefined && !(w > 1 && w < 200))) return setError(t("growth.implausible"));
    add.mutate(
      { measuredAt: `${day}T12:00:00.000Z`, ...(h !== undefined ? { heightCm: h } : {}), ...(w !== undefined ? { weightKg: w } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: onClose, onError: (err) => setError(err instanceof Error ? err.message : t("edit.failed")) },
    );
  };
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className={sheetClass}>
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t("growth.add")}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">{t("growth.addHint")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DateField id="measured" label={t("growth.date")} value={day} onChange={setDay} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="height" label={t("measure.height")}>
              <Input id="height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder={t("growth.cm")} />
            </Field>
            <Field id="weight" label={t("measure.weight")}>
              <Input id="weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={t("growth.kg")} />
            </Field>
          </div>
          <Field id="note" label={t("growth.note")}>
            <Input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("growth.notePlaceholder")} />
          </Field>
          <FormError message={error} />
          <PrimaryButton icon="check" disabled={add.isPending}>{t("edit.save")}</PrimaryButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}

