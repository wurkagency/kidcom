import { useState } from "react";
import { toast } from "sonner";
import type { MediaDownloadVariant } from "@kinnd/shared";
import {
  archiveTokenUrl,
  archiveUrl,
  mediaUrl,
  useEmailArchive,
  useFormat,
  useMomentsGallery,
  useSearchParams,
  useT,
} from "@kinnd/core";

import { FormError } from "../components/Form";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { formatBytes } from "./format";

// kinnd_download_preview: the chosen files (tap to leave one out), archive
// quality (original / optimized) and destination (this device / an emailed
// link). ?ids=a,b from the gallery, a moment or the viewer; ?token=… is
// the emailed link itself.

const NO_FILTERS = { categoryIds: [], types: [] };

export function DownloadScreen() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return token ? <EmailedDownload token={token} /> : <ChooseDownload ids={(params.get("ids") ?? "").split(",").filter(Boolean)} />;
}

function Title() {
  const { t } = useT("moments");
  return (
    <div className="flex items-center justify-between pt-1 pb-1">
      <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{t("download.title")}</h1>
    </div>
  );
}

// The export writes "rounded-DEFAULT" (not a class) here, so these rows render square.
const option = "flex p-3 cursor-pointer transition-colors";

function ChooseDownload({ ids }: { ids: string[] }) {
  const { t } = useT("moments");
  const fmt = useFormat();
  const { data: gallery = [], isLoading } = useMomentsGallery(null, NO_FILTERS);
  const files = ids.flatMap((id) => gallery.filter((g) => g.id === id));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [variant, setVariant] = useState<MediaDownloadVariant>("original");
  const [destination, setDestination] = useState<"device" | "email">("device");
  const email = useEmailArchive();
  const [error, setError] = useState<string | null>(null);

  const chosen = files.filter((f) => !excluded.has(f.id));
  const total = (key: "originalBytes" | "optimizedBytes") => chosen.reduce((sum, f) => sum + (f[key] ?? f.originalBytes ?? 0), 0);
  const originalTotal = total("originalBytes");
  const optimizedTotal = total("optimizedBytes");
  const saving = originalTotal ? Math.max(0, 1 - optimizedTotal / originalTotal) : 0;
  const size = variant === "original" ? originalTotal : optimizedTotal;

  const go = () => {
    setError(null);
    const mediaIds = chosen.map((f) => f.id);
    if (!mediaIds.length) return setError(t("download.noneChosen"));
    if (destination === "device") {
      window.location.assign(archiveUrl(mediaIds, variant));
      return;
    }
    email.mutate(
      { mediaIds, variant },
      { onSuccess: () => toast(t("download.emailSent")), onError: (err) => setError(err instanceof Error ? err.message : t("download.failed")) },
    );
  };

  return (
    <div className="flex flex-col w-full space-y-space-md pt-4">
      <Title />

      <section className="w-full space-y-space-xs">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">{t("download.selectedFiles")}</h2>
        </div>
        {!isLoading && files.length === 0 ? (
          <p className="font-body-md text-body-md text-secondary px-1">{t("download.nothing")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {files.map((f) => {
              const on = !excluded.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setExcluded((s) => {
                      const next = new Set(s);
                      if (on) next.add(f.id);
                      else next.delete(f.id);
                      return next;
                    })
                  }
                  className="relative aspect-square rounded-[20px] overflow-hidden bg-surface-container shadow-sm cursor-pointer active:scale-[0.98] transition-transform text-left"
                >
                  <img alt="" src={mediaUrl(f.id)} className={cn("w-full h-full object-cover", !on && "opacity-85")} />
                  {on && <div className="absolute inset-0 bg-primary/20 transition-opacity" />}
                  <div className={cn("absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t", on ? "from-primary/80 via-primary/30 to-transparent" : "from-primary/70 via-transparent to-transparent")}>
                    <p className="font-micro-meta text-micro-meta text-on-primary truncate">{f.postTitle}</p>
                    <span className={cn("font-micro-meta text-micro-meta block font-medium", on ? "text-primary-fixed" : "text-surface-container-high")}>
                      {formatBytes(fmt, f.originalBytes)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="w-full bg-surface-container-lowest rounded-lg p-space-md shadow-sm space-y-space-md">
        <div>
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-1.5 mb-space-xs">
            <Icon name="tune" className="text-[18px] text-on-surface-variant" />
            {t("download.quality")}
          </h3>
          <RadioGroup value={variant} onValueChange={(v) => setVariant(v as MediaDownloadVariant)} className="space-y-2 mt-2 gap-0">
            {(["original", "optimized"] as const).map((v) => (
              <label key={v} className={cn(option, "items-start", variant === v ? "bg-surface-container-low" : "bg-surface-bright active:bg-surface-container-low")}>
                <RadioGroupItem value={v} className="mt-0.5" />
                <div className="ml-3 min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-title-md text-title-md text-on-surface">{t(`download.${v}`)}</span>
                    <span className={cn("font-label-md text-label-md", v === "original" ? "text-on-surface font-semibold" : "text-secondary")}>
                      {formatBytes(fmt, v === "original" ? originalTotal : optimizedTotal)}
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-0.5 text-xs">
                    {v === "original" ? t("download.originalHint") : t("download.optimizedHint", { percent: fmt.percent(saving) })}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div>
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-1.5 mb-space-xs">
            <Icon name="send_to_mobile" className="text-[18px] text-on-surface-variant" />
            {t("download.destination")}
          </h3>
          <RadioGroup value={destination} onValueChange={(v) => setDestination(v as "device" | "email")} className="space-y-2 mt-2 gap-0">
            {(["device", "email"] as const).map((d) => (
              <label key={d} className={cn(option, "items-center", destination === d ? "bg-surface-container-low" : "bg-surface-bright active:bg-surface-container-low")}>
                <RadioGroupItem value={d} />
                <div className="ml-3 flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                    <Icon name={d === "device" ? "phone_iphone" : "mail"} className="text-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-title-md text-title-md text-on-surface block truncate">{t(`download.${d}`)}</span>
                    <span className="font-label-sm text-label-sm text-secondary truncate block">{t(`download.${d}Hint`)}</span>
                  </div>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        <FormError message={error} />
        <div className="pt-2">
          <button
            type="button"
            disabled={email.isPending || chosen.length === 0}
            onClick={go}
            className="w-full bg-black text-white py-3.5 px-space-md rounded-full font-label-md font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm disabled:opacity-60"
          >
            <Icon name={destination === "device" ? "download" : "mail"} className="text-[20px] text-white" />
            <span>{t(destination === "device" ? "download.go" : "download.goEmail", { size: formatBytes(fmt, size) })}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function EmailedDownload({ token }: { token: string }) {
  const { t } = useT("moments");
  return (
    <div className="flex flex-col w-full space-y-space-md pt-4">
      <Title />
      <section className="w-full bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-space-md">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface shrink-0">
            <Icon name="inventory_2" className="text-[20px]" />
          </div>
          <div className="flex flex-col">
            <span className="font-title-md text-title-md text-on-surface">{t("download.readyTitle")}</span>
            <span className="font-body-md text-body-md text-secondary">{t("download.readyBody")}</span>
          </div>
        </div>
        <a
          href={archiveTokenUrl(token)}
          className="w-full bg-black text-white py-3.5 px-space-md rounded-full font-label-md font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
        >
          <Icon name="download" className="text-[20px] text-white" />
          <span>{t("download.readyButton")}</span>
        </a>
      </section>
    </div>
  );
}
