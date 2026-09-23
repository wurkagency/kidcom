import type { Prisma } from "@kidcom/db";
import type { MediaAssetDto, MomentDto, MomentMediaDto, MomentMediaType } from "@kidcom/shared";

// Shared by the per-child moments routes, the cross-child feed and gallery
// (routes/moments), and bookmarks: one include, one DTO shape.

type MediaRow = {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: "PROCESSING" | "READY" | "FAILED";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

export function toMediaDto(m: MediaRow): MediaAssetDto {
  return { id: m.id, type: m.type, status: m.status, width: m.width, height: m.height, durationSeconds: m.durationSeconds };
}

/** Everything toMomentDto needs, for the requesting user. */
export const momentInclude = (userId: string) =>
  ({
    author: true,
    media: { orderBy: { createdAt: "asc" } },
    children: { select: { childId: true } },
    _count: { select: { comments: true, reactions: true } },
    reactions: { where: { userId }, select: { userId: true } },
    bookmarks: { where: { userId }, select: { id: true } },
  }) satisfies Prisma.MomentInclude;

export type MomentRow = Prisma.MomentGetPayload<{ include: ReturnType<typeof momentInclude> }>;

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function toMomentDto(post: MomentRow): MomentDto {
  return {
    id: post.id,
    childIds: post.children.map((c) => c.childId),
    authorId: post.authorId,
    authorName: `${post.author.firstName} ${post.author.lastName}`.trim(),
    authorAvatarUrl: post.author.avatarUrl,
    title: post.title,
    // Kept a plain string (never null) for callers.
    text: post.text ?? "",
    createdAt: post.createdAt.toISOString(),
    media: post.media.map(toMediaDto),
    commentCount: post._count.comments,
    reactionCount: post._count.reactions,
    reactedByMe: post.reactions.length > 0,
    categoryId: post.categoryId,
    location: post.location,
    occurredOn: dateOnly(post.occurredOn),
    familyVisible: post.familyVisible,
    bookmarkedByMe: post.bookmarks.length > 0,
  };
}

export const galleryInclude = (userId: string) =>
  ({
    moment: { include: { children: { select: { childId: true } } } },
    bookmarks: { where: { userId }, select: { id: true } },
  }) satisfies Prisma.MediaAssetInclude;

export type GalleryRow = Prisma.MediaAssetGetPayload<{ include: ReturnType<typeof galleryInclude> }>;

export function toMomentMediaDto(a: GalleryRow): MomentMediaDto {
  const m = a.moment!;
  return {
    ...toMediaDto(a),
    postId: m.id,
    postCreatedAt: m.createdAt.toISOString(),
    childIds: m.children.map((c) => c.childId),
    postTitle: m.title,
    categoryId: m.categoryId,
    occurredOn: dateOnly(m.occurredOn),
    bookmarkedByMe: a.bookmarks.length > 0,
    originalBytes: a.originalBytes,
    optimizedBytes: a.type === "VIDEO" ? a.playableBytes : a.derivedBytes,
  };
}

// ---------------------------------------------------------------------------
// Query-string filters: ?childIds=a,b&categoryIds=x,y&types=photo,video,text
// ---------------------------------------------------------------------------

const list = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

export function parseMomentFilters(query: Record<string, unknown>) {
  const types = list(query.types).filter((t): t is MomentMediaType => t === "photo" || t === "video" || t === "text");
  return { childIds: list(query.childIds), categoryIds: list(query.categoryIds), types };
}

/** Moments matching the filters (RLS narrows further to what the user may see). */
export function momentWhere(f: ReturnType<typeof parseMomentFilters>): Prisma.MomentWhereInput {
  const and: Prisma.MomentWhereInput[] = [];
  if (f.childIds.length) and.push({ children: { some: { childId: { in: f.childIds } } } });
  if (f.categoryIds.length) and.push({ categoryId: { in: f.categoryIds } });
  if (f.types.length) {
    const or: Prisma.MomentWhereInput[] = [];
    if (f.types.includes("photo")) or.push({ media: { some: { type: "IMAGE" } } });
    if (f.types.includes("video")) or.push({ media: { some: { type: "VIDEO" } } });
    if (f.types.includes("text")) or.push({ media: { none: {} } });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

/** Gallery assets matching the filters ("text" doesn't apply to media). */
export function galleryWhere(f: ReturnType<typeof parseMomentFilters>): Prisma.MediaAssetWhereInput {
  const kinds = f.types.filter((t) => t !== "text");
  return {
    status: "READY",
    // `is` makes the moment itself a condition: it must exist *and* be
    // visible (journal_posts RLS) — media_assets' own policy doesn't know
    // about moments hidden from extended family.
    moment: { is: momentWhere({ ...f, types: [] }) },
    ...(kinds.length === 1 ? { type: kinds[0] === "photo" ? "IMAGE" : "VIDEO" } : {}),
  };
}
