import { useState, type FormEvent } from "react";
import type { ListItemDto, ListItemType } from "@kidcom/shared";
import {
  dateKey,
  paths,
  useActiveChildren,
  useChildFamily,
  useCreateListItem,
  useDeleteListItem,
  useListItem,
  useNavigate,
  useParams,
  useSearchParams,
  useT,
  useUpdateListItem,
} from "@kidcom/core";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { ChildField, DateField, EditorTitle, Field, FormCard, FormError, PrimaryButton, SecondaryButton } from "../components/Form";
import { cn } from "../lib/utils";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

// Add / edit a necessity or wish (no Stitch export; DESIGN.md form parts).
// /lists/new?type=NECESSITY&child=… or /children/:childId/lists/:itemId/edit.

const NOBODY = "nobody";
const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";

export function ListItemEditScreen() {
  const { t } = useT("lists");
  const { childId, itemId } = useParams();
  const { data: existing, isLoading } = useListItem(childId, itemId);
  if (itemId && !existing) return <EditorTitle>{t(isLoading ? "common:loading" : "edit.notFound")}</EditorTitle>;
  return <ItemForm key={existing?.id ?? "new"} existing={existing} />;
}

function ItemForm({ existing }: { existing?: ListItemDto }) {
  const { t } = useT("lists");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { children: kids, selected } = useActiveChildren();
  const [pickedChild, setChildId] = useState<string | null>(existing?.childId ?? params.get("child"));
  const childId = pickedChild ?? selected[0]?.id ?? kids[0]?.id ?? "";
  const kid = kids.find((k) => k.id === childId);
  const [type, setType] = useState<ListItemType>(existing?.type ?? (params.get("type") === "WISHLIST" ? "WISHLIST" : "NECESSITY"));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [size, setSize] = useState(existing?.sizeValue ?? "");
  const [hasDue, setHasDue] = useState(Boolean(existing?.dueOn));
  const [dueOn, setDueOn] = useState(existing?.dueOn ?? dateKey());
  const [assignee, setAssignee] = useState(existing?.assignedToId ?? NOBODY);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { data: members = [] } = useChildFamily(childId || undefined);
  const create = useCreateListItem();
  const update = useUpdateListItem();
  const remove = useDeleteListItem();

  const sizeHints = [kid?.clothingSize, kid?.shoeSize].filter((s): s is string => Boolean(s));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t("edit.titleRequired"));
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      sizeValue: size.trim() || null,
      dueOn: hasDue ? dueOn : null,
      ...(type === "NECESSITY" ? { assignedToId: assignee === NOBODY ? null : assignee } : {}),
    };
    const done = { onSuccess: () => navigate(paths.lists.overview()), onError: (err: unknown) => setError(err instanceof Error ? err.message : t("edit.failed")) };
    if (existing) update.mutate({ childId: existing.childId, itemId: existing.id, body: fields }, done);
    else
      create.mutate(
        {
          childId,
          body: {
            type,
            title: fields.title,
            ...(fields.description ? { description: fields.description } : {}),
            ...(fields.sizeValue ? { sizeValue: fields.sizeValue } : {}),
            dueOn: fields.dueOn,
            ...(type === "NECESSITY" && assignee !== NOBODY ? { assignedToId: assignee } : {}),
          },
        },
        done,
      );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t(existing ? "edit.editTitle" : "edit.createTitle")}</EditorTitle>

      {!existing && (
        <ToggleGroup type="single" spacing={1} value={type} onValueChange={(v) => v && setType(v as ListItemType)} className={segmentedGroup} aria-label={t("edit.type")}>
          {(["NECESSITY", "WISHLIST"] as const).map((v) => (
            <ToggleGroupItem key={v} value={v} variant="segmented" className="flex-1 h-9">
              {t(`types.${v}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <FormCard>
        {!existing && <ChildField kids={kids} value={childId} onChange={setChildId} />}
        <Field id="title" label={t("edit.title")}>
          <Input id="title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t(type === "NECESSITY" ? "edit.titlePlaceholder" : "edit.wishPlaceholder")} />
        </Field>
        <Field id="size" label={t("edit.size")}>
          <Input id="size" value={size} maxLength={40} onChange={(e) => setSize(e.target.value)} placeholder={t("edit.sizePlaceholder")} />
          {sizeHints.length > 0 && (
            <div className="flex gap-2 pt-1">
              {sizeHints.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setSize(h)}
                  className={cn("px-3 py-1 rounded-full font-label-sm text-label-sm transition-colors", size === h ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface")}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field id="description" label={t("edit.description")}>
          <Textarea id="description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder={t("edit.descriptionPlaceholder")} />
        </Field>
      </FormCard>

      <FormCard>
        <label className="flex items-center justify-between gap-3">
          <span className="font-label-md text-label-md text-on-surface">{t("edit.hasDue")}</span>
          <Switch checked={hasDue} onCheckedChange={setHasDue} />
        </label>
        {hasDue && <DateField id="due" label={t("edit.due")} value={dueOn} onChange={setDueOn} />}
        {type === "NECESSITY" && (
          <Field id="assignee" label={t("edit.assignee")} hint={t("edit.assigneeHint")}>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="assignee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>{t("edit.nobody")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FormCard>

      <FormError message={error} />
      <PrimaryButton icon="check" disabled={create.isPending || update.isPending || !childId}>
        {t(existing ? "edit.save" : "edit.add")}
      </PrimaryButton>
      {existing && (
        <>
          <SecondaryButton icon="delete" className="text-error" onClick={() => setConfirming(true)}>
            {t("edit.delete")}
          </SecondaryButton>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("edit.confirmDelete")}
            confirmLabel={t("edit.delete")}
            pending={remove.isPending}
            onConfirm={() => remove.mutate({ childId: existing.childId, itemId: existing.id }, { onSuccess: () => navigate(paths.lists.overview(), { replace: true }) })}
          />
        </>
      )}
    </form>
  );
}
