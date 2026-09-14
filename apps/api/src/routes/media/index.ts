import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import type { MediaUploadResponse } from "@kidcom/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";
import { ApiError } from "../../middleware/errorHandler";
import { mediaStorage } from "../../lib/mediaStorage";
import { mediaQueue } from "../../lib/mediaQueue";

export const mediaRouter = Router();

// Permission-matrix note (spec §1.4/9.5, Phase 3): a Caregiver is supposed
// to get "media: view only", not upload/download-original. Deliberately NOT
// enforced in this file: `?variant=original` below is overloaded for real
// video *playback* (a VIDEO asset's derivative is a JPG poster frame, not a
// playable file — see the comment on that branch), not just a "download
// the original quality" action. Denying it to a Caregiver would silently
// break their ability to watch any video at all, which isn't what "view
// only" means. Upload itself also can't be gated here — a freshly uploaded
// asset has no child association yet (that only happens once it's attached
// to a journal post, an avatar, etc.), so there's no ChildAccess row to
// check against at this point. The practical effect a Caregiver actually
// needs blocked — they can't attach new media to a post — is already closed
// by journal.ts's "journal:post" gate.

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — generous for a phone photo/short clip

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Only image or video files are supported"));
    }
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

// Inverse of the above, plus the fixed extensions the worker's own
// derivatives always use (webp images, jpg video posters — see
// apps/api/src/worker.ts) — needed because a served file's real MIME type
// was never stored on MediaAsset itself, only inferred at upload time.
// Getting this right matters more for video than it ever did for images:
// browsers happily sniff image bytes with no/wrong Content-Type on an
// <img>, but <video> playback from a fetched Blob relies on the Blob's
// `type` (set from this header), not content sniffing.
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

function mimeForKey(key: string): string | undefined {
  const ext = key.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

function toDto(row: {
  id: string;
  type: "IMAGE" | "VIDEO";
  status: "PROCESSING" | "READY" | "FAILED";
  width: number | null;
  height: number | null;
}): MediaUploadResponse {
  return { id: row.id, type: row.type, status: row.status, width: row.width, height: row.height };
}

mediaRouter.post("/upload", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, "No file uploaded (expected multipart field 'file')");
    }
    const isVideo = req.file.mimetype.startsWith("video/");
    const ext = EXT_BY_MIME[req.file.mimetype] ?? (isVideo ? "mp4" : "jpg");
    const key = `original/${crypto.randomUUID()}.${ext}`;
    await mediaStorage.save(key, req.file.buffer);

    const asset = await prisma.mediaAsset.create({
      data: {
        ownerId: req.session.userId!,
        type: isVideo ? "VIDEO" : "IMAGE",
        status: "PROCESSING",
        originalPath: key,
      },
    });

    await mediaQueue.add("process-media", { mediaAssetId: asset.id });

    res.status(201).json(toDto(asset));
  } catch (err) {
    next(err);
  }
});

// Streams the derivative (falls back to the original if not processed yet)
// after checking the requester has ChildAccess to the asset's journal
// post's child. An asset not yet attached to a post is only readable by its
// owner (it's still being composed into a post).
//
// Avatars (avatarForUserId / avatarForChildId) get their own access rules
// since they aren't attached to a journal post:
// - A user's own avatar: viewable by that user, or by anyone who shares a
//   child with them (same "family" boundary ChildAccess draws everywhere
//   else) — checked by counting ChildAccess rows on children the viewer has
//   access to where some other ChildAccess row for the same child belongs
//   to the avatar's owner.
// - A child's avatar: viewable by anyone with ChildAccess to that child.
// A list item's photo (listItemImageFor) follows the same
// ChildAccess-to-that-item's-child rule as a child avatar.
mediaRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: req.params.id },
      include: {
        journalPost: {
          include: { children: { include: { child: { include: { access: true } } } } },
        },
        listItemImageFor: { select: { childId: true } },
      },
    });
    if (!asset) throw new ApiError(404, "Media not found");

    if (asset.journalPost) {
      // A journal post can now be tagged to multiple children (JournalPostChild
      // join table) — viewable if the requester has ChildAccess to ANY of them.
      const hasAccess = asset.journalPost.children.some((jpc) =>
        jpc.child.access.some((a) => a.userId === req.session.userId)
      );
      if (!hasAccess) throw new ApiError(403, "You don't have access to this media");
    } else if (asset.avatarForUserId) {
      const isSelf = asset.avatarForUserId === req.session.userId;
      const sharesChild = isSelf
        ? true
        : (await prisma.childAccess.count({
            where: {
              userId: req.session.userId!,
              child: { access: { some: { userId: asset.avatarForUserId } } },
            },
          })) > 0;
      if (!sharesChild) throw new ApiError(403, "You don't have access to this media");
    } else if (asset.avatarForChildId) {
      const hasAccess =
        (await prisma.childAccess.count({
          where: { childId: asset.avatarForChildId, userId: req.session.userId! },
        })) > 0;
      if (!hasAccess) throw new ApiError(403, "You don't have access to this media");
    } else if (asset.listItemImageFor) {
      // A Necessity/Wishlist item's photo — viewable by anyone with
      // ChildAccess to that item's child, same rule as avatars/journal media.
      const hasAccess =
        (await prisma.childAccess.count({
          where: { childId: asset.listItemImageFor.childId, userId: req.session.userId! },
        })) > 0;
      if (!hasAccess) throw new ApiError(403, "You don't have access to this media");
    } else if (asset.ownerId !== req.session.userId) {
      throw new ApiError(403, "You don't have access to this media");
    }

    // ?variant=original — used for video playback: the derivative for a
    // VIDEO asset is a JPG poster frame (see worker.ts's processVideo), not
    // a playable file, so <video> needs an actual playable file instead.
    // Prefer playablePath (an H.264/AAC/MP4 transcode worker.ts produces —
    // originalPath is whatever codec/container the uploading phone
    // produced, e.g. HEVC-in-.mov from an iPhone, which most non-Safari
    // browsers can't decode at all) and only fall back to the true original
    // if transcoding hasn't completed/failed. Default behavior
    // (derivedPath ?? originalPath) is unchanged for the plain <img> case
    // every other consumer already uses.
    const wantsOriginal = req.query.variant === "original";
    const key = wantsOriginal
      ? asset.playablePath ?? asset.originalPath
      : asset.derivedPath ?? asset.originalPath;
    if (!(await mediaStorage.exists(key))) {
      throw new ApiError(404, "Media file missing on disk");
    }
    res.setHeader("Cache-Control", "private, max-age=86400");
    const mime = mimeForKey(key);
    if (mime) {
      res.setHeader("Content-Type", mime);
    }
    mediaStorage.readStream(key).pipe(res);
  } catch (err) {
    next(err);
  }
});
