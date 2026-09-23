import { Router, type Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import archiver from "archiver";
import type { MediaArchiveRequest, MediaDownloadVariant, MediaInfoDto, MediaUploadResponse } from "@kidcom/shared";

import { config } from "../../config";
import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { mediaStorage } from "../../lib/mediaStorage";
import { mediaQueue } from "../../lib/mediaQueue";
import { mailSender } from "../../lib/mailSender";
import { renderDownloadLinkHtml } from "../../lib/emailTemplates/downloadLink";
import { toMediaDto } from "../../lib/moments";
import { withRls } from "../../lib/rls";

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

mediaRouter.post("/upload", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "No file uploaded (expected multipart field 'file')");
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
// - A child's avatar / a list item's photo: anyone with access to that child.
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
  } else if (asset.avatarForChildId || asset.listItemImageFor) {
    const childId = asset.avatarForChildId ?? asset.listItemImageFor!.childId;
    if (!(await prisma.childAccess.count({ where: { childId, userId } }))) throw denied();
  } else if (asset.ownerId !== userId) {
    throw denied();
  }
  return asset;
}

type Readable = Awaited<ReturnType<typeof loadReadableAsset>>;

/** Which stored file a request variant maps to. */
function keyFor(asset: Readable, variant: string | undefined): string {
  // "source": the untouched upload (downloads). "original": what <video>
  // plays — the H.264 transcode when there is one, since phones often record
  // HEVC that most browsers can't decode. Default: the in-app derivative
  // (WebP photo / JPEG poster frame).
  if (variant === "source") return asset.originalPath;
  if (variant === "original") return asset.playablePath ?? asset.originalPath;
  return asset.derivedPath ?? asset.originalPath;
}

/** The download variants: original = the upload; optimized = the in-app file. */
function downloadKey(asset: Readable, variant: MediaDownloadVariant): string {
  if (variant === "original") return asset.originalPath;
  return asset.type === "VIDEO" ? asset.playablePath ?? asset.originalPath : asset.derivedPath ?? asset.originalPath;
}

/** Streams a stored file, honouring a single Range (needed for video seeking on iOS). */
async function sendFile(res: Response, key: string, range: string | undefined, attachmentName?: string) {
  if (!(await mediaStorage.exists(key))) throw new ApiError(404, "Media file missing on disk");
  const { size } = await fsp.stat(mediaStorage.pathFor(key));
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
    fs.createReadStream(mediaStorage.pathFor(key), { start, end }).pipe(res);
    return;
  }
  res.setHeader("Content-Length", String(size));
  mediaStorage.readStream(key).pipe(res);
}

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "kidcom";

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
  // Every file is access-checked before the first byte is sent.
  const assets = [];
  for (const id of mediaIds) assets.push(await loadReadableAsset(userId, id));

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="kidcom-${new Date().toISOString().slice(0, 10)}.zip"`);
  const zip = archiver("zip", { store: true }); // photos/videos are already compressed
  zip.on("error", (err) => res.destroy(err));
  zip.pipe(res);
  const seen = new Map<string, number>();
  for (const asset of assets) {
    const key = downloadKey(asset, variant);
    if (!(await mediaStorage.exists(key))) continue;
    const base = slug(asset.moment?.title ?? "kidcom");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    zip.file(mediaStorage.pathFor(key), { name: `${base}-${n}.${extOf(key)}` });
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

mediaRouter.post("/archive/email", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const request = parseArchiveRequest(req.body);
    for (const id of request.mediaIds) await loadReadableAsset(userId, id);
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
      subject: "Your KidCom download is ready",
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
      originalBytes: asset.originalBytes,
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
    const key = keyFor(asset, variant);
    const attachment = variant === "source" ? `${slug(asset.moment?.title ?? "kidcom")}.${extOf(key)}` : undefined;
    await sendFile(res, key, req.headers.range, attachment);
  } catch (err) {
    next(err);
  }
});
