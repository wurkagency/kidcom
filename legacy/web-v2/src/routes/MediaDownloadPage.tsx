import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { JournalMediaDto } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { fetchMediaUrl, mediaUrl } from "../lib/media";
import { useHeaderConfig } from "../lib/HeaderContext";

// docs/Themes/Aura/kidcom_download_preview's screen. Reached from
// MediaGalleryTab's multi-select bar (see MediaGalleryPage.tsx), which now
// navigates here with the selected items in route state instead of firing
// browser downloads immediately.
//
// The mockup shows per-file names (e.g. "Leo baseball"), a codec/format
// breakdown, GPS-tagged locations, and an "Optimized" compressed format —
// none of that exists in this app's data model (JournalMediaDto carries no
// filename or byte size, and there's no server-side transcode pipeline).
// Rather than invent those, file size here is the real size of the fetched
// bytes (computed once each blob downloads, shown as "Calculating…" until
// then), files are labeled by type + position, and "Optimized"/"Email" are
// disabled with a "Coming soon" note rather than pretending to work.
export function MediaDownloadPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const items = (location.state as { items?: JournalMediaDto[] } | null)?.items ?? [];

  useHeaderConfig({ title: "Download", backTo: "/journal?tab=media" }, []);

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState<"device" | "email">("device");
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    items.forEach((item) => {
      if (item.status !== "READY") return;
      fetchMediaUrl(item.id).then((url) => {
        if (!cancelled) setThumbs((prev) => ({ ...prev, [item.id]: url }));
      });
      fetch(mediaUrl(item.id, item.type === "VIDEO" ? "original" : undefined), { credentials: "include" })
        .then((res) => res.blob())
        .then((blob) => {
          if (!cancelled) setSizes((prev) => ({ ...prev, [item.id]: blob.size }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBytes = items.reduce((sum, item) => sum + (sizes[item.id] ?? 0), 0);
  const allSized = items.every((item) => sizes[item.id] !== undefined);

  async function handleDownload() {
    setDownloading(true);
    try {
      for (const item of items) {
        const url = await fetchMediaUrl(item.id, item.type === "VIDEO" ? "original" : undefined);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.id}.${item.type === "VIDEO" ? "mp4" : "jpg"}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setDone(true);
    } finally {
      setDownloading(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-2">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Nothing selected — go back to Media Gallery and select files to download.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full px-container-padding pt-4 pb-12 gap-space-md">
      <section className="flex flex-col gap-1.5">
        <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
          Selected files
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((item, i) => (
            <div
              key={item.id}
              className="relative aspect-square rounded-[20px] overflow-hidden bg-surface-container shadow-sm"
            >
              {thumbs[item.id] ? (
                <div
                  className="w-full h-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${thumbs[item.id]})` }}
                />
              ) : (
                <div className="w-full h-full animate-pulse bg-surface-container-high" />
              )}
              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-on-surface/80 via-on-surface/30 to-transparent">
                <p className="font-micro-meta text-micro-meta text-inverse-on-surface truncate">
                  {item.type === "VIDEO" ? "Video" : "Photo"} {i + 1}
                </p>
                <span className="font-micro-meta text-micro-meta text-inverse-on-surface/80 block font-medium">
                  {sizes[item.id] !== undefined ? formatBytes(sizes[item.id]) : "…"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col gap-space-md">
        <div>
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-1.5 mb-2">
            <Icon name="tune" className="text-[18px] text-on-surface-variant" />
            Archive Quality &amp; Compression
          </h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-start p-3 rounded bg-surface-container-low cursor-pointer">
              <input checked readOnly className="mt-0.5 accent-primary w-4 h-4 shrink-0" type="radio" />
              <div className="ml-3 min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-title-md text-title-md text-on-surface">Original</span>
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    {allSized ? formatBytes(totalBytes) : "Calculating…"}
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                  Lossless files as uploaded originally.
                </p>
              </div>
            </label>
            <label className="flex items-start p-3 rounded bg-surface-container-low/50 opacity-60 cursor-not-allowed">
              <input disabled className="mt-0.5 accent-primary w-4 h-4 shrink-0" type="radio" />
              <div className="ml-3 min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-title-md text-title-md text-on-surface">Optimized</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Coming soon</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                  Compressed delivery isn't available yet.
                </p>
              </div>
            </label>
          </div>
        </div>
        <div>
          <h3 className="font-label-md text-label-md text-on-surface flex items-center gap-1.5 mb-2">
            <Icon name="send_to_mobile" className="text-[18px] text-on-surface-variant" />
            Delivery Destination
          </h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center p-3 rounded bg-surface-container-low cursor-pointer">
              <input
                checked={destination === "device"}
                onChange={() => setDestination("device")}
                className="accent-primary w-4 h-4 shrink-0"
                type="radio"
              />
              <div className="ml-3 flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Icon name="phone_iphone" className="text-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-title-md text-title-md text-on-surface block">Device</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Save to your downloads</span>
                </div>
              </div>
            </label>
            <label className="flex items-center p-3 rounded bg-surface-container-low/50 opacity-60 cursor-not-allowed">
              <input disabled className="accent-primary w-4 h-4 shrink-0" type="radio" />
              <div className="ml-3 flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Icon name="mail" className="text-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-title-md text-title-md text-on-surface block">Email</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Coming soon</span>
                </div>
              </div>
            </label>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full bg-primary text-on-primary py-3.5 px-space-md rounded-full font-label-md text-label-md flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm disabled:opacity-60"
        >
          <Icon name={downloading ? "progress_activity" : done ? "check" : "download"} className={downloading ? "animate-spin" : ""} />
          {downloading
            ? "Downloading…"
            : done
              ? "Downloaded"
              : `Download selected media${allSized ? ` (${formatBytes(totalBytes)})` : ""}`}
        </button>
      </section>

      <button
        onClick={() => navigate(-1)}
        className="self-center font-label-sm text-label-sm text-on-surface-variant underline underline-offset-4"
      >
        Back to Media Gallery
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
