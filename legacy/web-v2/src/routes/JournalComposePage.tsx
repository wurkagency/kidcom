import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateJournalPostRequest, JournalPostDto, MediaUploadResponse } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiPost, apiUpload, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// Mirrors MAX_UPLOAD_BYTES in apps/api/src/routes/media/index.ts — checking
// client-side lets us reject an oversized file immediately instead of only
// after a full upload attempt fails.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

type UploadedAsset = MediaUploadResponse & { fileName: string; previewUrl: string };

// Full-page replacement for the old JournalComposer modal, opened from the
// Journal FAB at /journal/new. Supports tagging the post to more than one
// child (JournalPostChild join table) and picking multiple photos/videos,
// each uploaded on pick via POST /media/upload — same "upload on pick"
// approach the modal used for its single file.
export function JournalComposePage() {
  const navigate = useNavigate();
  const { children } = useAuth();

  useHeaderConfig({ title: "New Journal Post", backTo: "/journal" }, []);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    children.length === 1 ? [children[0].id] : []
  );
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childError, setChildError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleChild(childId: string) {
    setChildError(null);
    setSelectedChildIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  }

  async function handleFilesPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`"${file.name}" is too large — max ${MAX_UPLOAD_MB}MB`);
          continue;
        }
        try {
          const formData = new FormData();
          formData.append("file", file);
          const asset = await apiUpload<MediaUploadResponse>("/media/upload", formData);
          setAssets((prev) => [...prev, { ...asset, fileName: file.name, previewUrl: URL.createObjectURL(file) }]);
        } catch (err) {
          setError(err instanceof ApiRequestError ? err.message : `Couldn't upload "${file.name}"`);
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function removeAsset(id: string) {
    setAssets((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (selectedChildIds.length === 0) {
      setChildError("Tag at least one child");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const post = await apiPost<JournalPostDto>(`/children/${selectedChildIds[0]}/journal`, {
        title,
        text,
        mediaAssetIds: assets.length ? assets.map((a) => a.id) : undefined,
        childIds: selectedChildIds,
      } satisfies CreateJournalPostRequest);
      navigate(`/journal/${post.id}?childId=${selectedChildIds[0]}`, {
        replace: true,
        state: { post },
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't post that — try again");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && !uploading && title.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col w-full min-h-screen">
      <div className="flex-1 overflow-y-auto px-container-padding py-section-margin flex flex-col gap-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFilesPick}
        />
        {assets.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {assets.map((a, i) => (
              <div key={a.id} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-container">
                <img src={a.previewUrl} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/50 text-white font-micro-meta text-micro-meta uppercase tracking-wider">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAsset(a.id)}
                  aria-label={`Remove ${a.fileName}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center"
                >
                  <Icon name="close" className="text-[14px]" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-[4/3] rounded-xl bg-surface-container-lowest border border-dashed border-outline-variant flex flex-col items-center justify-center gap-1 text-on-surface-variant disabled:opacity-60"
            >
              <Icon name={uploading ? "hourglass_top" : "add_photo_alternate"} />
              <span className="font-label-sm text-label-sm">{uploading ? "Uploading…" : "Add more"}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 rounded-xl bg-surface-container text-primary font-label-md text-label-md flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Icon name={uploading ? "hourglass_top" : "add_photo_alternate"} />
            {uploading ? "Uploading…" : "Add photos or videos"}
          </button>
        )}

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
            <Icon name="stylus_note" className="text-[16px]" /> Describe your moment
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Building the tallest tower!"
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
            required
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What happened? (optional)"
            rows={4}
            className="w-full bg-surface-container-lowest rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface-variant">Who is this about?</span>
            {children.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setChildError(null);
                  setSelectedChildIds((prev) =>
                    prev.length === children.length ? [] : children.map((c) => c.id)
                  );
                }}
                className="font-label-sm text-label-sm text-primary"
              >
                {selectedChildIds.length === children.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => {
              const selected = selectedChildIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChild(c.id)}
                  className={`pl-1.5 pr-3.5 py-1.5 rounded-full flex items-center gap-2 font-label-sm text-label-sm border transition-colors ${
                    selected
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-surface-container-lowest text-on-surface-variant border-transparent"
                  }`}
                >
                  <Avatar name={c.firstName} avatarAssetId={c.profileImageUrl} kind="child" size="xs" />
                  {c.firstName}
                </button>
              );
            })}
          </div>
          {selectedChildIds.length > 0 && (
            <span className="font-micro-meta text-micro-meta text-on-surface-variant">
              {selectedChildIds.length} of {children.length} included
            </span>
          )}
          {childError && <p className="font-label-sm text-label-sm text-error">{childError}</p>}
        </div>

        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-24 z-30 px-container-padding pt-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md shadow-lg disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Publish to Family Journal"}
        </button>
      </div>
    </form>
  );
}
