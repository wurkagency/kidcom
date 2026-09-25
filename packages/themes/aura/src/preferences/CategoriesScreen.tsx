import { useState, type FormEvent } from "react";
import { CATEGORY_TONES, type CategoryDto, type CategoryTone } from "@kinnd/shared";
import { useCategories, useCreateCategory, useDeleteCategory, useT, useUpdateCategory } from "@kinnd/core";

import { CategoryChip } from "../calendar/CategoryChip";
import { useCategoryName } from "../calendar/people";
import { SectionHeader } from "../calendar/Sections";
import { toneOf } from "../calendar/tones";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorTitle, Field, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { Input } from "../ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

// Preferences → Categories: the one category set shared by Calendar, Moments
// and Media. Built-in ones are fixed; users add their own (icon + tone).
// No Stitch export — DESIGN.md cards, chips and sheet.

const ICONS = [
  "event", "favorite", "star", "pets", "music_note", "sports_soccer", "sports_tennis", "pool", "school", "menu_book",
  "medical_services", "restaurant", "cake", "celebration", "child_care", "toys", "directions_car", "flight", "park", "beach_access",
  "palette", "theater_comedy", "home", "shopping_bag",
];

const listCard = "rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-4 flex flex-col divide-y divide-outline-variant/20";

export function CategoriesScreen() {
  const { t } = useT("categories");
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<CategoryDto | "new" | null>(null);
  const system = categories.filter((c) => c.key);
  const custom = categories.filter((c) => !c.key && !c.archived);

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("title")}</EditorTitle>
      <p className="font-body-md text-body-md text-secondary -mt-4">{t("intro")}</p>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t("custom")} count={String(custom.length)} />
        {custom.length === 0 ? (
          <p className="font-body-md text-body-md text-secondary px-1">{t("customEmpty")}</p>
        ) : (
          <div className={listCard}>
            {custom.map((c) => (
              <CategoryRow key={c.id} category={c} onEdit={c.ownedByMe ? () => setEditing(c) : undefined} />
            ))}
          </div>
        )}
        <PrimaryButton type="button" icon="add" onClick={() => setEditing("new")}>
          {t("add")}
        </PrimaryButton>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title={t("builtIn")} />
        <div className={listCard}>
          {system.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </div>
      </section>

      <CategorySheet key={editing === "new" ? "new" : (editing?.id ?? "closed")} category={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CategoryRow({ category, onEdit }: { category: CategoryDto; onEdit?: () => void }) {
  const { t } = useT("categories");
  const name = useCategoryName();
  const tone = toneOf(category.tone);
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", tone.chip)}>
          <Icon name={category.icon} className="text-[18px]" />
        </div>
        <span className="font-body-md text-sm text-on-surface font-medium truncate">{name(category)}</span>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} aria-label={t("edit")} className="w-9 h-9 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container">
          <Icon name="edit" className="text-[18px]" />
        </button>
      ) : (
        !category.ownedByMe && category.key && <Icon name="lock" className="text-[16px] text-outline" aria-label={t("locked")} />
      )}
    </div>
  );
}

function CategorySheet({ category, onClose }: { category: CategoryDto | "new" | null; onClose: () => void }) {
  const { t } = useT("categories");
  const existing = category && category !== "new" ? category : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0]!);
  const [tone, setTone] = useState<CategoryTone>(existing?.tone ?? "SAGE");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("nameRequired"));
    const body = { name: name.trim(), icon, tone };
    const done = { onSuccess: onClose, onError: (err: unknown) => setError(err instanceof Error ? err.message : t("saveFailed")) };
    if (existing) update.mutate({ id: existing.id, body }, done);
    else create.mutate(body, done);
  };

  const preview: CategoryDto = { id: "preview", key: null, name: name || t("namePlaceholder"), icon, tone, sortOrder: 0, ownedByMe: true, archived: false };

  return (
    <Sheet open={category !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[32px] border-hairline bg-surface-container-lowest px-margin pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-space-lg max-h-[90vh] overflow-y-auto">
        <SheetHeader className="p-0 pb-space-md text-left">
          <SheetTitle className="font-headline-sm text-headline-sm text-on-surface">{t(existing ? "editTitle" : "add")}</SheetTitle>
          <SheetDescription className="font-body-md text-body-md text-secondary">{t("sheetDescription")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <CategoryChip category={preview} className="w-fit" />
          <Field id="category-name" label={t("name")}>
            <Input id="category-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </Field>
          <Field label={t("color")}>
            <div role="radiogroup" aria-label={t("color")} className="flex gap-3">
              {CATEGORY_TONES.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={tone === x}
                  aria-label={t(`tones.${x}`)}
                  onClick={() => setTone(x)}
                  className={cn(
                    "w-10 h-10 rounded-full border",
                    toneOf(x).chip,
                    tone === x ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : "border-outline-variant/30",
                  )}
                />
              ))}
            </div>
          </Field>
          <Field label={t("icon")}>
            <div role="radiogroup" aria-label={t("icon")} className="grid grid-cols-6 gap-2">
              {ICONS.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={icon === x}
                  aria-label={x.replace(/_/g, " ")}
                  onClick={() => setIcon(x)}
                  className={cn(
                    "aspect-square rounded-xl flex items-center justify-center transition-colors",
                    icon === x ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container",
                  )}
                >
                  <Icon name={x} className="text-[20px]" />
                </button>
              ))}
            </div>
          </Field>
          <FormError message={error} />
          <PrimaryButton icon="check" disabled={create.isPending || update.isPending}>
            {t(existing ? "save" : "add")}
          </PrimaryButton>
          {existing && (
            <>
              <SecondaryButton icon="delete" className="text-error" onClick={() => setConfirming(true)}>
                {t("delete")}
              </SecondaryButton>
              <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t("confirmDelete")}
                body={t("confirmDeleteBody")}
                confirmLabel={t("delete")}
                pending={remove.isPending}
                onConfirm={() => remove.mutate(existing.id, { onSuccess: onClose })}
              />
            </>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
