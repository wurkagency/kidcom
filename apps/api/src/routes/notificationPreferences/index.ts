import { Router } from "express";
import type { NotificationPreferencesDto, UpdateNotificationPreferencesRequest } from "@kinnd/shared";

import { prisma } from "../../db";
import { requireAuth } from "../../middleware/session";

// One row per user, upserted on read — same pattern as /billing/status. No
// pushEnabled field here; Push Notifications on the settings page reads the
// real PushSubscription-existing-or-not state via /push, not this table.
export const notificationPreferencesRouter = Router();

notificationPreferencesRouter.use(requireAuth);

function toDto(row: {
  emailEnabled: boolean;
  googleCalendarSyncEnabled: boolean;
  office365SyncEnabled: boolean;
  categoryCalendar: boolean;
  categoryMoments: boolean;
  categoryLists: boolean;
  categoryMessages: boolean;
  doNotDisturb: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
}): NotificationPreferencesDto {
  return {
    emailEnabled: row.emailEnabled,
    googleCalendarSyncEnabled: row.googleCalendarSyncEnabled,
    office365SyncEnabled: row.office365SyncEnabled,
    categoryCalendar: row.categoryCalendar,
    categoryMoments: row.categoryMoments,
    categoryLists: row.categoryLists,
    categoryMessages: row.categoryMessages,
    doNotDisturb: row.doNotDisturb,
    quietHoursFrom: row.quietHoursFrom,
    quietHoursTo: row.quietHoursTo,
  };
}

notificationPreferencesRouter.get("/", async (req, res, next) => {
  try {
    const row = await prisma.notificationPreferences.upsert({
      where: { userId: req.session.userId! },
      update: {},
      create: { userId: req.session.userId! },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});

notificationPreferencesRouter.patch("/", async (req, res, next) => {
  try {
    const body = req.body as UpdateNotificationPreferencesRequest;
    const data = {
      ...(body.emailEnabled !== undefined && { emailEnabled: body.emailEnabled }),
      ...(body.googleCalendarSyncEnabled !== undefined && {
        googleCalendarSyncEnabled: body.googleCalendarSyncEnabled,
      }),
      ...(body.office365SyncEnabled !== undefined && { office365SyncEnabled: body.office365SyncEnabled }),
      ...(body.categoryCalendar !== undefined && { categoryCalendar: body.categoryCalendar }),
      ...(body.categoryMoments !== undefined && { categoryMoments: body.categoryMoments }),
      ...(body.categoryLists !== undefined && { categoryLists: body.categoryLists }),
      ...(body.categoryMessages !== undefined && { categoryMessages: body.categoryMessages }),
      ...(body.doNotDisturb !== undefined && { doNotDisturb: body.doNotDisturb }),
      ...(body.quietHoursFrom !== undefined && { quietHoursFrom: body.quietHoursFrom }),
      ...(body.quietHoursTo !== undefined && { quietHoursTo: body.quietHoursTo }),
    };
    const row = await prisma.notificationPreferences.upsert({
      where: { userId: req.session.userId! },
      update: data,
      create: { userId: req.session.userId!, ...data },
    });
    res.json(toDto(row));
  } catch (err) {
    next(err);
  }
});
