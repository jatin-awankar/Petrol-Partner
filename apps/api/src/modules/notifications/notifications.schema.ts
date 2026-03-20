import { z } from "zod";

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM or HH:MM:SS");

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const deviceTokenIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["pending", "sent", "read", "failed"]).optional(),
});

export const registerDeviceTokenSchema = z.object({
  platform: z.enum(["web", "android", "ios"]),
  token: z.string().trim().min(16).max(2048),
});

export const updateNotificationPreferencesSchema = z.object({
  new_match_push: z.boolean().optional(),
  booking_updates_push: z.boolean().optional(),
  payment_updates_push: z.boolean().optional(),
  marketing_push: z.boolean().optional(),
  quiet_hours_start: z.union([timeSchema, z.null()]).optional(),
  quiet_hours_end: z.union([timeSchema, z.null()]).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;
