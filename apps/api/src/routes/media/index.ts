import { Router, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import archiver from "archiver";
import type { MediaArchiveRequest, MediaDownloadVariant, MediaInfoDto, MediaUploadResponse } from "@kinnd/shared";

import { config } from "../../config";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { mediaStorage } from "../../lib/mediaStorage";
import { mediaQueue } from "../../lib/mediaQueue";
import { mailSender } from "../../lib/mailSender";
import { renderDownloadLinkHtml } from "../../lib/emailTemplates/downloadLink";
import { toMediaDto } from "../../lib/moments";
import { withRls, withRlsBypass } from "../../lib/rls";
import { consumptionBytes, heldTier, uploadedLastDayBytes } from "../../lib/circles";
import { DAILY_UPLOAD_CAP_BYTES, STORAGE_BLOCK_RATIO, TIERS } from "@kinnd/shared";
import type { NextFunction, Request } from "express";

/**
 * Subscription model §5: a user's uploads are refused once they'd take the
 * user past 90% of the storage their tier allows (consumption counted by
 * access), with the upgrade prompt; viewing is never blocked, and one
 * person's limit never blocks anyone else (D11). Plus a daily abuse cap.
 * Checked before the file is read (declared size), and again with the
 * real size.
 */
async function assertUploadAllowed(userId: string, bytes: number): Promise<void> {
  const [tier, used, today] = await Promise.all([heldTier(userId), consumptionBytes(userId), uploadedLastDayBytes(userId)]);
  const limitBytes = TIERS[tier].storageBytes;
  if (used + bytes > limitBytes * STORAGE_BLOCK_RATIO) {
    throw new ApiError(403, "Your storage is full — upgrade to keep uploading", "STORAGE_FULL", { usedBytes: used, limitBytes, tier });
  }
  if (today + bytes > DAILY_UPLOAD_CAP_BYTES) {
    throw new ApiError(429, "You've reached today's upload limit — try again tomorrow", "UPLOAD_DAILY_LIMIT");
  }
}

async function precheckUpload(req: Request, _res: Response, next: NextFunction) {
  try {
    const declared = Number(req.get("content-length") ?? 0);
    await assertUploadAllowed(req.session.userId!, Number.isFinite(declared) ? declared : 0);
    next();
  } catch (err) {
    next(err);
  }
}

/** Legal hold (§4): media under an active alarm, or uploaded by a user under one, is gone from the app. */
async function onLegalHold(asset: { id: string; ownerId: string }): Promise<boolean> {
  return (
    (await prisma.alarm.count({
      where: { status: "ACTIVE", OR: [{ mediaAssetId: asset.id }, { userId: asset.ownerId }] },
    })) > 0
  );
}

export const mediaRouter = Router();

// Permission-matrix note (spec §1.4/9.5): upload can't be gated per child
// here (a fresh upload has no child yet) — attaching media to a post is
// what "moments:post" gates. ?variant=original is also what video playback
// uses, so it stays open to everyone who can see the asset.

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — generous for a phone photo/short clip
const MAX_ARCHIVE_ITEMS = 200;
const DOWNLOAD_LINK_TTL_DAYS = 7;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new ApiError(400, "Only image or video files are supported"));
  },
});

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// The served file's type comes from its extension (the worker's derivatives
// are always webp images, jpg posters, mp4 transcodes). <video> playback
// relies on this header, not content sniffing.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const extOf = (key: string) => key.split(".").pop()?.toLowerCase() ?? "";
const mimeForKey = (key: string): string | undefined => MIME_BY_EXT[extOf(key)];

mediaRouter.post("/upload", requireAuth, precheckUpload, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "No file uploaded (expected multipart field 'file')");
    await assertUploadAllowed(req.session.userId!, req.file.size);
    const isVideo = req.file.mimetype.startsWith("video/");
    const ext = EXT_BY_MIME[req.file.mimetype] ?? (isVideo ? "mp4" : "jpg");
    const key = `original/${crypto.randomUUID()}.${ext}`;
    await mediaStorage.save(key, req.file.buffer);

    const asset = await withRls(req.session.userId!, (tx) =>
      tx.mediaAsset.create({
        data: {
          ownerId: req.session.userId!,
          type: isVideo ? "VIDEO" : "IMAGE",
          status: "PROCESSING",
          originalPath: key,
          mimeType: req.file!.mimetype,
          originalBytes: req.file!.size,
          // For manage.kinnd.eu's abuse and fraud checks; never sent to clients.
          uploadIp: req.ip ?? null,
          uploadUserAgent: req.get("user-agent")?.slice(0, 500) ?? null,
        },
      })
    );
    await mediaQueue.add("process-media", { mediaAssetId: asset.id });
    const body: MediaUploadResponse = toMediaDto(asset);
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Access: who may read an asset
// ---------------------------------------------------------------------------
// - Moment media: anyone with ChildAccess to one of the moment's children.
//   A moment hidden from extended family isn't visible to them at all (the
//   journal_posts RLS policy), so `asset.moment` comes back null for them
//   and they fall through to the owner-only rule below.
// - A user's avatar: that user, or anyone who shares a child with them.
// - A child's avatar or cover photo / a list item's photo: anyone with access to that child.
// - A photo sent in a conversation: that conversation's members.
// - Anything else (an upload not yet attached): its owner only.
// Access is checked on every request, so revoking access takes effect at once.

async function loadReadableAsset(userId: string, id: string) {
  const asset = await withRls(userId, (tx) =>
    tx.mediaAsset.findUnique({
      where: { id },
      include: {
        moment: {
          include: {
            author: true,
            media: { select: { id: true }, orderBy: { createdAt: "asc" } },
            children: { include: { child: { include: { access: true } } } },
          },
        },
        listItemImageFor: { select: { childId: true } },
        bookmarks: { where: { userId }, select: { id: true } },
      },
    })
  );
  if (!asset) throw new ApiError(404, "Media not found");
  if (await onLegalHold(asset)) throw new ApiError(404, "Media not found");

  const denied = () => new ApiError(403, "You don't have access to this media");
  if (asset.moment) {
    const hasAccess = asset.moment.children.some((mc) => mc.child.access.some((a) => a.userId === userId));
    if (!hasAccess) throw denied();
  } else if (asset.avatarForUserId) {
    if (asset.avatarForUserId !== userId) {
      const sharesChild = await prisma.childAccess.count({
        where: { userId, child: { access: { some: { userId: asset.avatarForUserId } } } },
      });
      if (!sharesChild) throw denied();
    }
  } else if (asset.avatarForChildId || asset.coverForChildId || asset.listItemImageFor) {
    const childId = asset.avatarForChildId ?? asset.coverForChildId ?? asset.listItemImageFor!.childId;
    if (!(await prisma.childAccess.count({ where: { childId, userId } }))) throw denied();
  } else if (asset.ownerId !== userId) {
    // A photo sent in a conversation: that conversation's members.
    const sentToMe = await prisma.message.count({ where: { mediaId: asset.id, thread: { members: { some: { userId } } } } });
    if (!sentToMe) throw denied();
  }
  return asset;
}

type Readable = Awaited<ReturnType<typeof loadReadableAsset>>;

/**
 * The original as this viewer may have it. The uploader gets their file
 * untouched; everyone else gets it with the location removed — or, when the
 * format couldn't be stripped losslessly, the optimized version. Until the
 * worker has checked a file for location, only its uploader can have it.
 */
function originalFor(asset: Readable, userId: string): string {
  if (asset.ownerId === userId) return asset.originalPath;
  if (asset.status !== "READY") throw new ApiError(409, "Still processing — try again in a moment", "MEDIA_PROCESSING");
  if (asset.sharedOriginalPath) return asset.sharedOriginalPath;
  if (asset.capturedLatitude === null) return asset.originalPath;
  return asset.type === "VIDEO" ? asset.playablePath ?? asset.derivedPath! : asset.derivedPath!;
}

/** Which stored file a request variant maps to. */
function keyFor(asset: Readable, variant: string | undefined, userId: string): string {
  // "source": the original (downloads). "original": what <video> plays —
  // the H.264 transcode, since phones often record HEVC most browsers can't
  // decode (and the transcode carries no location). Default: the in-app
  // derivative (WebP photo / JPEG poster frame), metadata-free.
  if (variant === "source") return originalFor(asset, userId);
  if (variant === "original") return asset.playablePath ?? originalFor(asset, userId);
  return asset.derivedPath ?? originalFor(asset, userId);
}

/** The download variants: original = as uploaded (location-free for others); optimized = the in-app file. */
function downloadKey(asset: Readable, variant: MediaDownloadVariant, userId: string): string {
  if (variant === "original") return originalFor(asset, userId);
  return (asset.type === "VIDEO" ? asset.playablePath : asset.derivedPath) ?? originalFor(asset, userId);
}

/** Streams a stored (encrypted) file, honouring a single Range (video seeking on iOS). */
async function sendFile(res: Response, key: string, range: string | undefined, attachmentName?: string) {
  if (!(await mediaStorage.exists(key))) throw new ApiError(404, "Media file missing on disk");
  const size = await mediaStorage.size(key);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("Accept-Ranges", "bytes");
  const mime = mimeForKey(key);
  if (mime) res.setHeader("Content-Type", mime);
  if (attachmentName) res.setHeader("Content-Disposition", `attachment; filename="${attachmentName}"`);

  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    pipe(await mediaStorage.readStream(key, { start, end }), res);
    return;
  }
  res.setHeader("Content-Length", String(size));
  pipe(await mediaStorage.readStream(key), res);
}

/** A decryption failure mid-stream can't become an error page any more: end the response. */
function pipe(stream: NodeJS.ReadableStream, res: Response) {
  stream.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("Media stream failed:", err);
    res.destroy(err as Error);
  });
  stream.pipe(res);
}

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "kinnd";

// ---------------------------------------------------------------------------
// Archives (Download screen): a zip streamed straight to the device, or a
// 7-day link emailed to the user that serves the same zip to them only.
// Registered before "/:id" so "archive" is never read as a media id.
// ---------------------------------------------------------------------------

function parseArchiveRequest(body: unknown): MediaArchiveRequest {
  const b = (body ?? {}) as Partial<MediaArchiveRequest>;
  const ids = Array.isArray(b.mediaIds) ? [...new Set(b.mediaIds.filter((x): x is string => typeof x === "string"))] : [];
  if (!ids.length) throw new ApiError(400, "Choose at least one file");
  if (ids.length > MAX_ARCHIVE_ITEMS) throw new ApiError(400, `At most ${MAX_ARCHIVE_ITEMS} files at a time`);
  const variant = b.variant === "optimized" ? "optimized" : "original";
  return { mediaIds: ids, variant };
}

async function streamArchive(res: Response, userId: string, { mediaIds, variant }: MediaArchiveRequest) {
  // Every file is access-checked (and its key chosen) before the first byte is sent.
  const files: { key: string; asset: Readable }[] = [];
  for (const id of mediaIds) {
    const asset = await loadReadableAsset(userId, id);
    files.push({ asset, key: downloadKey(asset, variant, userId) });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="kinnd-${new Date().toISOString().slice(0, 10)}.zip"`);
  const zip = archiver("zip", { store: true }); // photos/videos are already compressed
  zip.on("error", (err) => res.destroy(err));
  zip.pipe(res);
  const seen = new Map<string, number>();
  for (const { asset, key } of files) {
    if (!(await mediaStorage.exists(key))) continue;
    const base = slug(asset.moment?.title ?? "kinnd");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    zip.append(await mediaStorage.readStream(key), { name: `${base}-${n}.${extOf(key)}` });
  }
  await zip.finalize();
}

mediaRouter.post("/archive", requireAuth, async (req, res, next) => {
  try {
    await streamArchive(res, req.session.userId!, parseArchiveRequest(req.body));
  } catch (err) {
    next(err);
  }
});

// The same zip as a plain GET (?ids=a,b&variant=original), so the browser
// streams it straight to disk instead of buffering it in the page.
mediaRouter.get("/archive", requireAuth, async (req, res, next) => {
  try {
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter(Boolean) : [];
    await streamArchive(res, req.session.userId!, parseArchiveRequest({ mediaIds: ids, variant: req.query.variant }));
  } catch (err) {
    next(err);
  }
});

// D5 "download my data": a suspended child is hidden everywhere, but its
// parents and guardians can still take a zip of its photos and videos from
// inside the app until the child is deleted on day 90. Uploaders get their
// originals; everyone else the location-free copy (or the optimized one).
mediaRouter.get("/suspended/:childId/archive", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const { childId } = req.params;
    const row = await prisma.suspendedChildAccess.findUnique({ where: { childId_userId: { childId, userId } } });
    if (!row || row.reason !== "CHILD_SUSPENDED" || (row.role !== "PARENT" && row.role !== "GUARDIAN")) {
      throw new ApiError(404, "Nothing to download");
    }
    const assets = await withRlsBypass((tx) =>
      tx.mediaAsset.findMany({
        where: {
          status: "READY",
          alarms: { none: { status: "ACTIVE" } },
          OR: [{ moment: { children: { some: { childId } } } }, { avatarForChildId: childId }, { coverForChildId: childId }],
        },
        include: { moment: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      })
    );
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="kinnd-${new Date().toISOString().slice(0, 10)}.zip"`);
    const zip = archiver("zip", { store: true });
    zip.on("error", (err) => res.destroy(err));
    zip.pipe(res);
    const seen = new Map<string, number>();
    for (const asset of assets) {
      const key = asset.ownerId === userId ? asset.originalPath : (asset.sharedOriginalPath ?? asset.derivedPath);
      if (!key || !(await mediaStorage.exists(key))) continue;
      const base = slug(asset.moment?.title ?? "kinnd");
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      zip.append(await mediaStorage.readStream(key), { name: `${base}-${n}.${extOf(key)}` });
    }
    await zip.finalize();
  } catch (err) {
    next(err);
  }
});

mediaRouter.post("/archive/email", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const request = parseArchiveRequest(req.body);
    for (const id of request.mediaIds) downloadKey(await loadReadableAsset(userId, id), request.variant, userId);
    const token = crypto.randomBytes(32).toString("base64url");
    const user = await withRls(userId, async (tx) => {
      await tx.mediaDownloadLink.create({
        data: {
          userId,
          tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
          mediaIds: request.mediaIds,
          variant: request.variant,
          expiresAt: new Date(Date.now() + DOWNLOAD_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, firstName: true } });
    });
    const link = `${config.webBaseUrl}/media/download?token=${token}`;
    await mailSender.send({
      to: user.email,
      subject: "Your Kinnd download is ready",
      text: `Hi ${user.firstName},\n\nYour ${request.mediaIds.length} files are ready to download for the next ${DOWNLOAD_LINK_TTL_DAYS} days:\n${link}\n\nSign in with this account to download them.`,
      html: renderDownloadLinkHtml({ firstName: user.firstName, count: request.mediaIds.length, link, ttlDays: DOWNLOAD_LINK_TTL_DAYS }),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

mediaRouter.get("/archive/:token", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const link = await withRls(userId, (tx) => tx.mediaDownloadLink.findUnique({ where: { tokenHash } }));
    // RLS already hides other users' links; an expired one is gone too.
    if (!link || link.userId !== userId || link.expiresAt < new Date()) {
      throw new ApiError(404, "This download link has expired", "DOWNLOAD_LINK_EXPIRED");
    }
    await streamArchive(res, userId, { mediaIds: link.mediaIds, variant: link.variant === "optimized" ? "optimized" : "original" });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// One asset
// ---------------------------------------------------------------------------

mediaRouter.get("/:id/info", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const asset = await loadReadableAsset(userId, req.params.id);
    const m = asset.moment;
    const body: MediaInfoDto = {
      ...toMediaDto(asset),
      mimeType: asset.mimeType,
      codec: asset.codec,
      originalBytes: asset.ownerId === userId ? asset.originalBytes : (asset.sharedOriginalBytes ?? asset.originalBytes),
      optimizedBytes: asset.type === "VIDEO" ? asset.playableBytes : asset.derivedBytes,
      bookmarkedByMe: asset.bookmarks.length > 0,
      moment: m
        ? {
            id: m.id,
            childIds: m.children.map((c) => c.childId),
            title: m.title,
            authorId: m.authorId,
            authorName: `${m.author.firstName} ${m.author.lastName}`.trim(),
            authorAvatarUrl: m.author.avatarUrl,
            categoryId: m.categoryId,
            location: m.location,
            occurredOn: m.occurredOn ? m.occurredOn.toISOString().slice(0, 10) : null,
            createdAt: m.createdAt.toISOString(),
            index: m.media.findIndex((x) => x.id === asset.id),
            mediaIds: m.media.map((x) => x.id),
          }
        : null,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

mediaRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const asset = await loadReadableAsset(req.session.userId!, req.params.id);
    const variant = typeof req.query.variant === "string" ? req.query.variant : undefined;
    const key = keyFor(asset, variant, req.session.userId!);
    const attachment = variant === "source" ? `${slug(asset.moment?.title ?? "kinnd")}.${extOf(key)}` : undefined;
    await sendFile(res, key, req.headers.range, attachment);
  } catch (err) {
    next(err);
  }
});
