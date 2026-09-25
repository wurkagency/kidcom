import type { CommentDto, MediaInfoDto, MomentDto, MomentMediaDto } from "@kinnd/shared";

import { FIXTURE_NOW } from "./calendarFixture";

// The Moments / Media sample content from kinnd_moments_feed_1/_2,
// kinnd_download_preview and kinnd_media_viewer_player. "Now" is the
// calendar fixture's Monday 12 October 2026, 09:00 Copenhagen.

export { FIXTURE_NOW };

const img = (id: string) => ({ id, type: "IMAGE" as const, status: "READY" as const, width: 1600, height: 1200, durationSeconds: null });

const moment = (m: Partial<MomentDto> & Pick<MomentDto, "id" | "title" | "authorId" | "authorName" | "createdAt">): MomentDto => ({
  childIds: ["c-leo"],
  authorAvatarUrl: null,
  text: "",
  media: [],
  commentCount: 0,
  reactionCount: 0,
  reactedByMe: false,
  categoryId: null,
  location: null,
  occurredOn: m.createdAt.slice(0, 10),
  familyVisible: true,
  bookmarkedByMe: false,
  ...m,
});

export const homeRun = moment({
  id: "m-homerun",
  title: "First Home Run at Little League!",
  text: "Leo hit his first genuine outfield hit today during the Saturday championship! Coach said his batting stance was textbook. He wanted to make sure Mom and Mormor saw the picture!",
  authorId: "u-dad",
  authorName: "Jonas Nielsen",
  createdAt: "2026-10-12T12:20:00Z", // today 14:20
  media: [img("p-1"), img("p-2"), img("p-3"), img("p-4")],
  reactionCount: 4,
  commentCount: 3,
  categoryId: "cat_sport",
  location: "Oakwood Little League Field, Pasadena",
});

export const feed: MomentDto[] = [
  homeRun,
  moment({
    id: "m-picnic",
    title: "Sunday Picnic along the Coast",
    text: "Hot cocoa in thermoses, cinnamon buns and sea breeze. Maya found five smooth white pebbles for her treasure box and Leo built a driftwood fortress.",
    authorId: "u-charlie",
    authorName: "Charlie Nielsen",
    createdAt: "2026-10-11T14:45:00Z", // yesterday 16:45
    media: [img("p-5")],
    reactionCount: 6,
    commentCount: 5,
  }),
  moment({
    id: "m-art",
    title: "First Day of Pre-school Art Exhibition",
    text: "Maya was so proud showing us her watercolor rainbow and family portrait. It is now drying in the hallway!",
    authorId: "u-inger",
    authorName: "Inger Nielsen",
    createdAt: "2026-10-08T10:00:00Z", // Thursday
    media: [img("p-6")],
    reactionCount: 5,
    commentCount: 2,
  }),
];

export const comments: CommentDto[] = [
  { id: "cm-1", authorId: "u-charlie", authorName: "Anna Nielsen", authorAvatarUrl: null, text: "Look at that focus! So proud of him! I saved this for the memory book. Can we frame this for his bedroom?", createdAt: "2026-10-12T05:00:00Z" },
  { id: "cm-2", authorId: "u-inger", authorName: "Inger Nielsen", authorAvatarUrl: null, text: "Bravo Leo! Mormor is making pancakes tomorrow morning to celebrate! 🥞🥞", createdAt: "2026-10-12T06:00:00Z" },
  { id: "cm-3", authorId: "u-dad", authorName: "Jonas Nielsen", authorAvatarUrl: null, text: "Absolutely, high-res download is ready for print!", createdAt: "2026-10-12T06:30:00Z" },
];

const tile = (id: string, title: string, mb: number, type: "IMAGE" | "VIDEO" = "IMAGE"): MomentMediaDto => ({
  ...img(id),
  type,
  durationSeconds: type === "VIDEO" ? 42 : null,
  postId: "m-homerun",
  postCreatedAt: "2026-10-12T12:20:00Z",
  childIds: ["c-leo"],
  postTitle: title,
  categoryId: null,
  occurredOn: "2026-10-12",
  bookmarkedByMe: false,
  originalBytes: Math.round(mb * 1024 * 1024),
  optimizedBytes: Math.round(mb * 1024 * 1024 * 0.064),
});

export const gallery: MomentMediaDto[] = [
  tile("d-1", "Leo baseball", 12.4),
  tile("d-2", "Coast picnic", 24.8),
  tile("d-3", "Cabin hug", 27.0),
  tile("d-4", "Maya portrait", 18.1),
  tile("d-5", "Leo portrait", 16.3),
  tile("d-6", "Drawing craft", 8.6),
];

export const videoInfo: MediaInfoDto = {
  id: "v-1",
  type: "VIDEO",
  status: "READY",
  width: 3840,
  height: 2160,
  durationSeconds: 190,
  mimeType: "video/quicktime",
  codec: "hevc",
  originalBytes: Math.round(68.4 * 1024 * 1024),
  optimizedBytes: Math.round(12.6 * 1024 * 1024),
  bookmarkedByMe: true,
  moment: {
    id: "m-homerun",
    childIds: ["c-leo"],
    title: "First Home Run at Little League",
    authorId: "u-charlie",
    authorName: "Charlie Nielsen",
    authorAvatarUrl: null,
    categoryId: "cat_sport",
    location: "Oakwood Field, Pasadena",
    occurredOn: "2026-10-12",
    createdAt: "2026-10-12T12:20:00Z",
    index: 0,
    mediaIds: ["v-1", "p-2", "p-3", "p-4"],
  },
};
