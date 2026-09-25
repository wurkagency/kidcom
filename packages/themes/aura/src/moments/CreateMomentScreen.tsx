import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MomentDto } from "@kinnd/shared";
import {
  dateKey,
  mediaUrl,
  paths,
  useActiveChildren,
  useCategories,
  useCreateMoment,
  useFormat,
  useMoment,
  useNavigate,
  useSearchParams,
  useT,
  useUpdateMoment,
  useUploadMedia,
} from "@kinnd/core";

import { useCategoryName } from "../calendar/people";
import { menuContentClass } from "../calendar/Sections";
import { toneOf } from "../calendar/tones";
import { FormError } from "../components/Form";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Calendar } from "../ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import { PlanNotice } from "../billing/PlanNotice";
import { isPlanError } from "../billing/errors";
import { DurationBadge } from "./parts";

// kinnd_create_moment: up to six photos/videos (the first is the cover),
// headline, story, tagged children, category, date, a typed location,
// audience (family or parents only) and an optional notification.
// ?edit=<id>&child=<id> reopens a moment for its author (media stays).

const MAX_FILES = 6;

type Upload = { key: string; previewUrl: string; isVideo: boolean; assetId?: string; failed?: boolean };

const card = "bg-surface-container-lowest rounded-2xl shadow-[0_2px_12px_rgba(22,26,24,0.03)]";
const upperLabel = "font-label-md text-label-md text-on-surface-variant uppercase tracking-wider";

export function CreateMomentScreen() {
  const { t } = useT("moments");
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const { data: existing, isLoading } = useMoment(params.get("child") ?? undefined, editId ?? undefined);
  if (editId && !existing) {
    return <h1 className="text-3xl font-extrabold tracking-tight text-on-surface pt-4">{t(isLoading ? "common:loading" : "post.notFound")}</h1>;
  }
  return <MomentForm key={existing?.id ?? "new"} existing={existing} />;
}

function MomentForm({ existing }: { existing?: MomentDto }) {
  const { t } = useT("moments");
  const fmt = useFormat();
  const navigate = useNavigate();
  const { children: kids, selected } = useActiveChildren();
  const { data: categories = [] } = useCategories();
  const categoryName = useCategoryName();
  const upload = useUploadMedia();
  const create = useCreateMoment();
  const update = useUpdateMoment();
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.text ?? "");
  const [picked, setChildIds] = useState<string[] | null>(existing ? existing.childIds : null);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [day, setDay] = useState(existing?.occurredOn ?? dateKey());
  const [location, setLocation] = useState(existing?.location ?? "");
  const [familyVisible, setFamilyVisible] = useState(existing?.familyVisible ?? true);
  const [notify, setNotify] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<unknown>(null);

  // Before the user picks, the header's selection decides (children load async).
  const childIds = picked ?? selected.map((c) => c.id);
  const uploading = uploads.some((u) => !u.assetId && !u.failed);
  const category = categories.find((c) => c.id === categoryId);

  useEffect(() => () => uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | null) => {
    const room = MAX_FILES - uploads.length;
    for (const file of Array.from(files ?? []).slice(0, room)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setUploads((list) => [...list, { key, previewUrl: URL.createObjectURL(file), isVideo: file.type.startsWith("video/") }]);
      upload.mutate(file, {
        onSuccess: (asset) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, assetId: asset.id } : u))),
        onError: () => setUploads((list) => list.map((u) => (u.key === key ? { ...u, failed: true } : u))),
      });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPlanError(null);
    if (!title.trim()) return setError(t("create.titleRequired"));
    if (!childIds.length) return setError(t("create.childRequired"));
    const fields = { title: title.trim(), text: text.trim(), categoryId, location: location.trim() || null, occurredOn: day, familyVisible };
    const onError = (err: unknown) => (isPlanError(err) ? setPlanError(err) : setError(err instanceof Error ? err.message : t("create.failed")));
    if (existing) {
      update.mutate(
        { childId: existing.childIds[0]!, momentId: existing.id, body: fields },
        { onSuccess: (m) => navigate(paths.moments.detail(m.childIds[0]!, m.id), { replace: true }), onError },
      );
      return;
    }
    create.mutate(
      {
        childId: childIds[0]!,
        body: { ...fields, childIds, notify, mediaAssetIds: uploads.flatMap((u) => (u.assetId ? [u.assetId] : [])) },
      },
      { onSuccess: (m) => navigate(paths.moments.detail(m.childIds[0]!, m.id), { replace: true }), onError },
    );
  };

  const toggleChild = (id: string) => setChildIds(childIds.includes(id) ? childIds.filter((x) => x !== id) : [...childIds, id]);
  const existingMedia = existing?.media.filter((m) => m.status === "READY") ?? [];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col w-full pb-10 space-y-6">
      <div className="flex items-center justify-between mt-2 pt-2 pb-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{t(existing ? "create.editTitle" : "create.title")}</h1>
      </div>

      {/* Media */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className={upperLabel}>
            {t("create.selectedFiles", { count: existing ? existingMedia.length : uploads.length, max: MAX_FILES })}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {existing
            ? existingMedia.map((m, i) => (
                <div key={m.id} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-container shadow-sm">
                  <img alt="" src={mediaUrl(m.id)} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent pointer-events-none" />
                  {i === 0 && <CoverTag />}
                </div>
              ))
            : uploads.map((u, i) => (
                <div key={u.key} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-container shadow-sm group">
                  {u.isVideo ? (
                    <video src={u.previewUrl} muted playsInline className="w-full h-full object-cover" />
                  ) : (
                    <img alt="" src={u.previewUrl} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent pointer-events-none" />
                  {i === 0 && <CoverTag />}
                  {u.isVideo && <DurationBadge seconds={null} className="bottom-1.5 right-1.5" />}
                  {!u.assetId && !u.failed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                      <Icon name="progress_activity" className="text-[20px] text-white animate-spin" aria-label={t("create.uploading")} />
                    </div>
                  )}
                  {u.failed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-error/60 text-white font-micro-meta text-micro-meta uppercase">
                      {t("create.uploadFailed")}
                    </div>
                  )}
                  <button
                    aria-label={t("create.remove")}
                    type="button"
                    onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary/40 backdrop-blur-md flex items-center justify-center text-white/90 hover:text-white hover:bg-primary/60 active:scale-95 transition-all"
                  >
                    <Icon name="close" className="text-[11px]" />
                  </button>
                </div>
              ))}
          {!existing && uploads.length < MAX_FILES && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="relative aspect-[4/3] rounded-2xl bg-mint hover:bg-surface-container-high active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-secondary hover:text-on-surface border border-dashed border-outline-variant"
            >
              <Icon name="add" className="text-[24px] text-on-surface" />
              <span className="font-label-sm text-[11px] font-semibold">{t("create.addMedia")}</span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Words */}
      <div className="flex flex-col space-y-5">
        <div className="flex flex-col space-y-1 px-1 pt-2 pb-1">
          <h2 className="text-[18px] font-bold text-on-surface tracking-tight">{t("create.describeTitle")}</h2>
          <p className="text-label-sm text-on-surface-variant leading-relaxed">{t("create.describeBody")}</p>
        </div>
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between px-1 pb-1 pt-1">
            <label className={upperLabel} htmlFor="moment-title">
              {t("create.headline")}
            </label>
          </div>
          <div className="relative flex items-center">
            <input
              id="moment-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("create.headlinePlaceholder")}
              className="w-full h-13 px-4 py-3 pr-11 bg-surface-container-lowest rounded-2xl font-body-lg text-body-lg text-on-surface placeholder:text-outline shadow-[0_2px_12px_rgba(22,26,24,0.03)] focus:outline-none focus:ring-2 focus:ring-secondary-container transition-all"
            />
            <Icon name="stylus_note" className="absolute right-3.5 text-[20px] text-secondary" />
          </div>
        </div>
        <div className="flex flex-col space-y-1.5">
          <div className="flex items-center justify-between px-1 pt-2 pb-1">
            <label className={upperLabel} htmlFor="moment-story">
              {t("create.story")}
            </label>
          </div>
          <textarea
            id="moment-story"
            rows={4}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("create.storyPlaceholder")}
            className="w-full p-4 bg-surface-container-lowest rounded-2xl font-body-md text-body-md text-on-surface leading-relaxed placeholder:text-outline shadow-[0_2px_12px_rgba(22,26,24,0.03)] focus:outline-none focus:ring-2 focus:ring-secondary-container resize-none transition-all"
          />
        </div>

        {/* Children */}
        {!existing && (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-label-md text-label-md text-on-surface font-semibold">{t("create.tagChildren")}</span>
              <span className="font-micro-meta text-micro-meta text-secondary">{t("create.included", { count: childIds.length })}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {kids.map((k) => {
                const on = childIds.includes(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleChild(k.id)}
                    className={cn(
                      "inline-flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full shadow-sm active:scale-95 transition-all",
                      on ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant shadow-[0_2px_8px_rgba(22,26,24,0.04)]",
                    )}
                  >
                    <PersonAvatar mediaId={k.profileImageUrl} initials={k.firstName.charAt(0)} className="w-8 h-8" />
                    <span className="font-label-md text-label-md font-semibold">{k.firstName}</span>
                    {on && <Icon name="check_circle" className="text-[16px] text-secondary-container" />}
                  </button>
                );
              })}
              {kids.length > 1 && (
                <button
                  type="button"
                  onClick={() => setChildIds(kids.map((k) => k.id))}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-lowest text-on-surface-variant shadow-[0_2px_8px_rgba(22,26,24,0.04)] active:scale-95 transition-transform"
                >
                  <Icon name="select_all" className="text-[18px] text-secondary" />
                  <span className="font-label-md text-label-md">{t("create.selectAll")}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between px-1 pt-2 pb-1">
            <span className="text-[18px] font-bold text-on-surface tracking-tight">{t("create.settings")}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(card, "w-full h-13 px-4 py-3 flex items-center justify-between text-left active:scale-[0.99] transition-transform")}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center", category ? toneOf(category.tone).chip : "bg-secondary-container text-on-secondary-container")}>
                  <Icon name={category?.icon ?? "category"} className="text-[18px]" />
                </span>
                <span className="font-body-lg text-body-lg text-on-surface font-medium truncate">
                  {category ? categoryName(category) : t("create.chooseCategory")}
                </span>
              </div>
              <Icon name="expand_more" className="text-[22px] text-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={cn(menuContentClass, "w-[var(--radix-dropdown-menu-trigger-width)] max-h-80 p-2 gap-1")}>
              {categories
                .filter((c) => !c.archived || c.id === categoryId)
                .map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => setCategoryId(c.id)}
                    className={cn(
                      "w-full px-3 py-2 rounded-xl text-on-surface flex items-center justify-between font-label-md text-label-md focus:bg-surface-container",
                      c.id === categoryId && "bg-secondary-container/40",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon name={c.icon} className="text-[18px] text-secondary" />
                      {categoryName(c)}
                    </span>
                    {c.id === categoryId && <Icon name="check" className="text-[16px] text-secondary" />}
                  </DropdownMenuItem>
                ))}
              {categoryId && (
                <DropdownMenuItem onSelect={() => setCategoryId(null)} className="w-full px-3 py-2 rounded-xl text-secondary font-label-md text-label-md focus:bg-surface-container">
                  {t("create.noCategory")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger className={cn(card, "p-3 flex items-center gap-3 text-left")}>
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface shrink-0">
                <Icon name="calendar_today" className="text-[20px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-micro-meta text-micro-meta text-secondary uppercase tracking-wider">{t("create.dateRecorded")}</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                  {day === dateKey()
                    ? t("create.todayDate", { date: fmt.date(`${day}T12:00:00Z`, { month: "long", day: "numeric", year: "numeric" }) })
                    : fmt.date(`${day}T12:00:00Z`, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 p-space-lg shadow-[0_12px_32px_-6px_rgba(22,26,24,0.22)]">
              <Calendar
                mode="single"
                selected={new Date(`${day}T12:00:00`)}
                defaultMonth={new Date(`${day}T12:00:00`)}
                disabled={{ after: new Date() }}
                onSelect={(d) => {
                  if (!d) return;
                  setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <label className={cn(card, "p-3 flex items-center gap-3")}>
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface shrink-0">
              <Icon name="location_on" className="text-[20px]" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-micro-meta text-micro-meta text-secondary uppercase tracking-wider">{t("create.location")}</span>
              <input
                value={location}
                maxLength={200}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("create.locationPlaceholder")}
                className="font-label-md text-label-md text-on-surface font-semibold bg-transparent outline-none placeholder:text-outline placeholder:font-medium min-w-0"
              />
            </div>
          </label>
        </div>

        {/* Audience */}
        <div className="flex flex-col space-y-2.5 pt-2">
          <div className="flex items-center gap-2 px-1">
            <Icon name="security" className="text-[20px] text-secondary" />
            <h2 className="text-[18px] font-bold text-on-surface tracking-tight">{t("create.audienceTitle")}</h2>
          </div>
          <div className={cn(card, "p-4 flex flex-col space-y-4")}>
            <label className="flex items-center justify-between gap-3">
              <div className="flex flex-col pr-2">
                <span className="font-body-md text-body-md font-semibold text-on-surface">{t("create.visibleToFamily")}</span>
                <span className="font-label-sm text-label-sm text-secondary">{t(familyVisible ? "create.visibleOn" : "create.visibleOff")}</span>
              </div>
              <Switch checked={familyVisible} onCheckedChange={setFamilyVisible} className="h-7 w-12" />
            </label>
            {!existing && (
              <>
                <div className="h-px w-full bg-surface-container" />
                <label className="flex items-center justify-between gap-3">
                  <div className="flex flex-col pr-2 min-w-0">
                    <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{t("create.notify")}</span>
                    <span className="font-label-sm text-label-sm text-secondary">{t("create.notifyHint")}</span>
                  </div>
                  <Switch checked={notify} onCheckedChange={setNotify} className="h-7 w-12" />
                </label>
              </>
            )}
          </div>
        </div>

        <FormError message={error} />
      {planError ? <PlanNotice error={planError} /> : null}
        <div className="pt-3">
          <button
            type="submit"
            disabled={uploading || create.isPending || update.isPending}
            className="w-full py-4 px-6 rounded-2xl bg-primary text-on-primary shadow-[0_12px_28px_rgba(22,26,24,0.2)] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all hover:bg-inverse-surface disabled:opacity-60"
          >
            <Icon name="auto_awesome" filled className="text-[20px]" />
            <span className="font-title-md text-title-md font-bold">
              {uploading ? t("create.waitForUploads") : t(existing ? "create.save" : "create.publish")}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}

function CoverTag() {
  const { t } = useT("moments");
  return (
    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary/40 backdrop-blur-md font-medium text-[10px] text-white/90 shadow-sm">
      {t("create.cover")}
    </span>
  );
}
