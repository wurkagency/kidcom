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
mediaRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: req.params.id },
      include: {
        journalPost: {
          include: { children: { include: { child: { include: { access: true } } } } },
        },
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
    } else if (asset.ownerId !== req.session.userId) {
      throw new ApiError(403, "You don't have access to this media");
    }

    const key = asset.derivedPath ?? asset.originalPath;
    if (!(await mediaStorage.exists(key))) {
      throw new ApiError(404, "Media file missing on disk");
    }
    res.setHeader("Cache-Control", "private, max-age=86400");
    mediaStorage.readStream(key).pipe(res);
  } catch (err) {
    next(err);
  }
});
