import { useEffect, useRef, useState } from "react";
import type { MediaUploadResponse } from "@kidcom/shared";

import { apiUpload, ApiRequestError } from "../lib/api";
import { fetchMediaUrl, releaseMediaUrl } from "../lib/media";

// Mirrors MAX_UPLOAD_BYTES in apps/api/src/routes/media/index.ts — reject an
// oversized file immediately instead of only after a full upload attempt
// fails (same guard JournalComposer uses).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "w-10 h-10",
  md: "w-20 h-20",
  lg: "w-32 h-32",
};

// Clickable circle used for both the user's own avatar (ProfilePage) and a
// child's photo (ChildProfilePage). Uploads immediately via POST
// /media/upload on file pick (same "upload on pick" approach as
// JournalComposer) and hands the new asset id back to the caller, which
// decides which endpoint (PATCH /auth/me or PATCH /children/:id) to PATCH
// with it — this component stays decoupled from that choice.
export function AvatarUpload({
  currentAssetId,
  fallbackLetter,
  onUploaded,
  size = "md",
}: {
  currentAssetId: string | null;
  fallbackLetter: string;
  onUploaded: (newAssetId: string) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!currentAssetId) {
      setResolvedUrl(null);
      return;
    }
    fetchMediaUrl(currentAssetId)
      .then((url) => {
        if (!cancelled) setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
      });
    return () => {
      cancelled = true;
      releaseMediaUrl(currentAssetId);
    };
  }, [currentAssetId]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File too large — max ${MAX_UPLOAD_MB}MB`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const asset = await apiUpload<MediaUploadResponse>("/media/upload", formData);
      onUploaded(asset.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Upload failed — try again");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="Change photo"
        className={`relative ${sizeClass} rounded-full overflow-hidden shrink-0 disabled:opacity-60`}
      >
        {resolvedUrl ? (
          <img src={resolvedUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed font-headline-lg">
            {fallbackLetter.toUpperCase()}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
          {uploading && (
            <span className="font-label-sm text-label-sm text-white">Uploading…</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFilePick}
          className="hidden"
        />
      </button>
      {error && (
        <p className="font-label-sm text-label-sm text-error">{error}</p>
      )}
    </div>
  );
}
