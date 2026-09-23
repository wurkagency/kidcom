import type { MessageDto, NotificationDto, SearchResponse, ThreadSummaryDto } from "@kidcom/shared";

import { FIXTURE_NOW } from "./calendarFixture";

// The Messages sample content from kidcom_messages_1 (inbox) and
// kidcom_calendar_5 (the conversation with Inger). "Now" is the calendar
// fixture's Monday 12 October 2026, 09:00 Copenhagen.

export { FIXTURE_NOW };

const person = (userId: string, firstName: string) => ({ userId, firstName, lastName: "Nielsen", avatarUrl: `a-${userId}` });

const msg = (id: string, threadId: string, senderId: string, senderName: string, createdAt: string, text: string | null, mediaId: string | null = null): MessageDto => ({
  id,
  threadId,
  senderId,
  senderName,
  senderAvatarUrl: senderId === "u-charlie" ? null : `a-${senderId}`,
  text,
  mediaId,
  createdAt,
});

const summary = (id: string, who: ReturnType<typeof person>, createdAt: string, text: string, unreadCount = 0): ThreadSummaryDto => ({
  id,
  isGroup: false,
  members: [who],
  lastMessage: msg(`${id}-last`, id, who.userId, who.firstName, createdAt, text),
  unread: unreadCount > 0,
  unreadCount,
});

export const inger = person("u-inger", "Inger");

export const threads: ThreadSummaryDto[] = [
  summary("t-inger", inger, "2026-10-11T15:00:00Z", "Looking forward to having both Leo and Maya over on June 7th! ❤️"),
  summary("t-dad", person("u-dad", "Charlie"), "2026-10-12T06:20:00Z", "Picked up soccer shin guards. See you at handover at 15:00."),
  summary("t-erik", person("u-erik", "Erik"), "2026-09-19T10:00:00Z", "Picked up soccer shin guards. See you at handover at 15:00."),
  summary("t-peter", person("u-peter", "Peter"), "2026-09-19T09:00:00Z", "Picked up soccer shin guards. See you at handover at 15:00.", 1),
  summary("t-henriette", person("u-henriette", "Henriette"), "2026-09-14T09:00:00Z", "Picked up soccer shin guards. See you at handover at 15:00."),
];

export const ingerThread = { id: "t-inger", isGroup: false, members: [inger] };

export const ingerMessages: MessageDto[] = [
  msg("m1", "t-inger", "u-inger", "Inger Nielsen", "2026-10-12T06:42:00Z", "Hey Sara, I'll pick up Leo from soccer practice at 4:30 PM today. Coach said to bring his shin guards. Also, here are the photos from his game last Saturday!"),
  msg("m2", "t-inger", "u-inger", "Inger Nielsen", "2026-10-12T06:42:30Z", "Supercross show in Herning", "p-1"),
  msg("m3", "t-inger", "u-charlie", "Charlie Nielsen", "2026-10-12T06:45:00Z", "Thanks Michael! That works great. I packed his spare shin guards and water bottle in his backpack. Here's a photo of the school art project he made for you today:"),
  msg("m4", "t-inger", "u-charlie", "Charlie Nielsen", "2026-10-12T06:45:30Z", "Art for Grandma", "p-2"),
  msg("m5", "t-inger", "u-inger", "Inger Nielsen", "2026-10-12T06:48:00Z", "He did such an amazing job on that! I'll put it on my fridge right away. See you at the 4:30 PM handover."),
];

export const notifications: NotificationDto[] = [
  {
    id: "n1",
    kind: "event.created",
    params: { actor: "Jonas", title: "Dentist", startsAt: "2026-10-14T08:00:00.000Z", allDay: 0 },
    url: "/children/c-leo/events/e1",
    childId: "c-leo",
    actorId: "u-dad",
    actorAvatarUrl: null,
    createdAt: "2026-10-12T06:30:00Z",
    read: false,
  },
  {
    id: "n2",
    kind: "list.claimed",
    params: { actor: "Inger", title: "Rain boots" },
    url: "/lists",
    childId: "c-leo",
    actorId: "u-inger",
    actorAvatarUrl: "a-u-inger",
    createdAt: "2026-10-10T12:00:00Z",
    read: true,
  },
];

export const searchResults: SearchResponse = {
  children: [],
  moments: [{ id: "m-homerun", childId: "c-leo", title: "First Home Run at Little League!", snippet: "", createdAt: "2026-10-12T12:20:00Z" }],
  listItems: [],
  events: [{ id: "e-dentist", childId: "c-leo", title: "Dentist", startsAt: "2026-10-14T08:00:00.000Z", allDay: false }],
};
