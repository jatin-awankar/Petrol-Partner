import { AppError } from "../../shared/errors/app-error";
import type {
  ListNotificationsQuery,
  RegisterDeviceTokenInput,
  UpdateNotificationPreferencesInput,
} from "./notifications.schema";
import * as notificationsRepo from "./notifications.repo";

const defaultPreferences = {
  new_match_push: true,
  booking_updates_push: true,
  payment_updates_push: true,
  marketing_push: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  const result = await notificationsRepo.listNotificationsForUser({
    userId,
    limit: query.limit,
    offset: query.offset,
    status: query.status,
  });

  return {
    notifications: result.notifications,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: result.notifications.length,
      total: result.totalCount,
    },
  };
}

export async function getNotificationPreferences(userId: string) {
  const existing = await notificationsRepo.findNotificationPreferencesByUserId(userId);

  if (existing) {
    return existing;
  }

  return notificationsRepo.upsertNotificationPreferences({
    userId,
    newMatchPush: defaultPreferences.new_match_push,
    bookingUpdatesPush: defaultPreferences.booking_updates_push,
    paymentUpdatesPush: defaultPreferences.payment_updates_push,
    marketingPush: defaultPreferences.marketing_push,
    quietHoursStart: defaultPreferences.quiet_hours_start,
    quietHoursEnd: defaultPreferences.quiet_hours_end,
  });
}

export async function updateNotificationPreferences(
  userId: string,
  input: UpdateNotificationPreferencesInput,
) {
  const current = await getNotificationPreferences(userId);

  return notificationsRepo.upsertNotificationPreferences({
    userId,
    newMatchPush: input.new_match_push ?? current.new_match_push,
    bookingUpdatesPush: input.booking_updates_push ?? current.booking_updates_push,
    paymentUpdatesPush: input.payment_updates_push ?? current.payment_updates_push,
    marketingPush: input.marketing_push ?? current.marketing_push,
    quietHoursStart:
      input.quiet_hours_start === undefined ? current.quiet_hours_start : input.quiet_hours_start,
    quietHoursEnd:
      input.quiet_hours_end === undefined ? current.quiet_hours_end : input.quiet_hours_end,
  });
}

export function registerDeviceToken(userId: string, input: RegisterDeviceTokenInput) {
  return notificationsRepo.registerDeviceToken({
    userId,
    platform: input.platform,
    token: input.token,
  });
}

export function listDeviceTokens(userId: string) {
  return notificationsRepo.listDeviceTokensByUser(userId);
}

export async function revokeDeviceToken(userId: string, deviceTokenId: string) {
  const deviceToken = await notificationsRepo.revokeDeviceToken(userId, deviceTokenId);

  if (!deviceToken) {
    throw new AppError(404, "Device token not found", "DEVICE_TOKEN_NOT_FOUND");
  }

  return deviceToken;
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await notificationsRepo.markNotificationRead(userId, notificationId);

  if (!notification) {
    throw new AppError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
  }

  return notification;
}

export function markAllNotificationsRead(userId: string) {
  return notificationsRepo.markAllNotificationsRead(userId);
}

export function createInAppNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}) {
  return notificationsRepo.createNotification({
    userId: input.userId,
    type: input.type,
    channel: "in_app",
    title: input.title,
    body: input.body,
    data: input.data,
    dedupeKey: input.dedupeKey ?? null,
    status: "sent",
    sentAt: new Date(),
  });
}
