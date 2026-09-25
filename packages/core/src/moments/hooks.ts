import { useCallback, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type {
  BookmarksResponse,
  CommentDto,
  CreateMomentRequest,
  MediaDownloadVariant,
  MediaInfoDto,
  MediaUploadResponse,
  MomentDto,
  MomentMediaDto,
  MomentMediaType,
  MomentsPage,
  UpdateMomentRequest,
} from "@kinnd/shared";

import { api, apiUrl } from "../api/client";

// Moments, media and bookmarks. The feed and gallery span every child the
// user can see; the header's child selection and the filters narrow them.

const enc = encodeURIComponent;
const post = (childId: string, momentId: string) => `/children/${enc(childId)}/moments/${enc(momentId)}`;

export type MomentFilters = {
  /** Category ids; empty = all */
  categoryIds: string[];
  /** Photos / videos / words only; empty = all */
  types: MomentMediaType[];
};

export const MOMENT_TYPES: readonly MomentMediaType[] = ["photo", "video", "text"];

const FILTER_KEY = "kinnd.momentFilters";

/** The Categories / Types filters, remembered for the browser session. */
export function useMomentFilters() {
  const [filters, set] = useState<MomentFilters>(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? "null") as Partial<MomentFilters> | null;
      return {
        categoryIds: Array.isArray(raw?.categoryIds) ? raw.categoryIds.filter((x): x is string => typeof x === "string") : [],
        types: Array.isArray(raw?.types) ? raw.types.filter((x): x is MomentMediaType => MOMENT_TYPES.includes(x as MomentMediaType)) : [],
      };
    } catch {
      return { categoryIds: [], types: [] };
    }
  });
  const setFilters = useCallback((next: MomentFilters) => {
    set(next);
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; still applied.
    }
  }, []);
  return { filters, setFilters };
}

function query(childIds: string[] | null, f: MomentFilters) {
  const p = new URLSearchParams();
  if (childIds?.length) p.set("childIds", childIds.join(","));
  if (f.categoryIds.length) p.set("categoryIds", f.categoryIds.join(","));
  if (f.types.length) p.set("types", f.types.join(","));
  return p;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useMomentsFeed(childIds: string[] | null, filters: MomentFilters) {
  const qs = query(childIds, filters).toString();
  return useInfiniteQuery({
    queryKey: ["moments", "feed", qs],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(qs);
      if (pageParam) p.set("cursor", pageParam);
      return api.get<MomentsPage>(`/moments?${p}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMomentsGallery(childIds: string[] | null, filters: MomentFilters) {
  const qs = query(childIds, { ...filters, types: filters.types.filter((t) => t !== "text") }).toString();
  return useQuery({
    queryKey: ["moments", "gallery", qs],
    queryFn: async () => (await api.get<{ items: MomentMediaDto[] }>(`/moments/media?${qs}`)).items,
  });
}

export function useMoment(childId: string | undefined, momentId: string | undefined) {
  return useQuery({
    queryKey: ["moments", "one", momentId],
    queryFn: () => api.get<MomentDto>(post(childId!, momentId!)),
    enabled: Boolean(childId && momentId),
  });
}

export function useMomentComments(childId: string | undefined, momentId: string | undefined) {
  return useQuery({
    queryKey: ["moments", "comments", momentId],
    queryFn: async () => (await api.get<{ items: CommentDto[] }>(`${post(childId!, momentId!)}/comments`)).items,
    enabled: Boolean(childId && momentId),
  });
}

export function useMediaInfo(mediaId: string | undefined) {
  return useQuery({
    queryKey: ["media", "info", mediaId],
    queryFn: () => api.get<MediaInfoDto>(`/media/${enc(mediaId!)}/info`),
    enabled: Boolean(mediaId),
  });
}

export function useBookmarks() {
  return useQuery({ queryKey: ["bookmarks"], queryFn: () => api.get<BookmarksResponse>("/bookmarks") });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const refreshMoments = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ["moments"] });

/** Applies `update` to a moment wherever it's cached (feed pages, single). */
function patchMoment(qc: QueryClient, momentId: string, update: (m: MomentDto) => MomentDto) {
  const feeds = qc.getQueriesData<InfiniteData<MomentsPage>>({ queryKey: ["moments", "feed"] });
  for (const [key, data] of feeds) {
    if (!data) continue;
    qc.setQueryData<InfiniteData<MomentsPage>>(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === momentId ? update(m) : m)) })),
    });
  }
  qc.setQueryData<MomentDto>(["moments", "one", momentId], (m) => (m ? update(m) : m));
}

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: MomentDto) =>
      api.post<{ reactedByMe: boolean; reactionCount: number }>(`${post(m.childIds[0]!, m.id)}/reactions`),
    onMutate: (m) =>
      patchMoment(qc, m.id, (x) => ({ ...x, reactedByMe: !x.reactedByMe, reactionCount: x.reactionCount + (x.reactedByMe ? -1 : 1) })),
    onSuccess: (res, m) => patchMoment(qc, m.id, (x) => ({ ...x, ...res })),
    onError: () => void refreshMoments(qc),
  });
}

export function useAddComment(childId: string, momentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<CommentDto>(`${post(childId, momentId)}/comments`, { text }),
    onSuccess: (c) => {
      qc.setQueryData<CommentDto[]>(["moments", "comments", momentId], (list) => [...(list ?? []), c]);
      patchMoment(qc, momentId, (m) => ({ ...m, commentCount: m.commentCount + 1 }));
    },
  });
}

export function useDeleteComment(childId: string, momentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete<void>(`${post(childId, momentId)}/comments/${enc(commentId)}`),
    onSuccess: (_r, commentId) => {
      qc.setQueryData<CommentDto[]>(["moments", "comments", momentId], (list) => list?.filter((c) => c.id !== commentId));
      patchMoment(qc, momentId, (m) => ({ ...m, commentCount: Math.max(0, m.commentCount - 1) }));
    },
  });
}

/** Bookmark / un-bookmark a moment or one photo/video. */
export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { momentId?: string; mediaAssetId?: string; bookmarked: boolean }) => {
      const [field, id] = v.momentId ? (["momentId", v.momentId] as const) : (["mediaAssetId", v.mediaAssetId!] as const);
      return v.bookmarked
        ? api.post<void>("/bookmarks", { [field]: id })
        : api.delete<void>(`/bookmarks?${field}=${enc(id)}`);
    },
    onMutate: (v) => {
      if (v.momentId) patchMoment(qc, v.momentId, (m) => ({ ...m, bookmarkedByMe: v.bookmarked }));
      if (v.mediaAssetId) qc.setQueryData<MediaInfoDto>(["media", "info", v.mediaAssetId], (i) => (i ? { ...i, bookmarkedByMe: v.bookmarked } : i));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["bookmarks"] });
      void qc.invalidateQueries({ queryKey: ["moments", "gallery"] });
    },
  });
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<MediaUploadResponse>("/media/upload", form);
    },
  });
}

export function useCreateMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; body: CreateMomentRequest }) =>
      api.post<MomentDto>(`/children/${enc(v.childId)}/moments`, v.body),
    onSuccess: () => void refreshMoments(qc),
  });
}

export function useUpdateMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; momentId: string; body: UpdateMomentRequest }) =>
      api.patch<MomentDto>(post(v.childId, v.momentId), v.body),
    onSuccess: () => void refreshMoments(qc),
  });
}

export function useDeleteMoment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { childId: string; momentId: string }) => api.delete<void>(post(v.childId, v.momentId)),
    onSuccess: () => {
      void refreshMoments(qc);
      void qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export function useEmailArchive() {
  return useMutation({
    mutationFn: (v: { mediaIds: string[]; variant: MediaDownloadVariant }) => api.post<void>("/media/archive/email", v),
  });
}

/** A URL that downloads a zip of the files (the browser streams it to disk). */
export const archiveUrl = (mediaIds: string[], variant: MediaDownloadVariant) =>
  apiUrl(`/media/archive?ids=${mediaIds.map(enc).join(",")}&variant=${variant}`);

/** The zip behind an emailed download link. */
export const archiveTokenUrl = (token: string) => apiUrl(`/media/archive/${enc(token)}`);

/** One file as uploaded, as a download. */
export const mediaDownloadUrl = (mediaId: string) => apiUrl(`/media/${enc(mediaId)}?variant=source`);

/** What <video> plays (the browser-safe transcode when there is one). */
export const mediaPlaybackUrl = (mediaId: string) => apiUrl(`/media/${enc(mediaId)}?variant=original`);
