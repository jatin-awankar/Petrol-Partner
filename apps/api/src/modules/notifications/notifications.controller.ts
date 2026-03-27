import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  deviceTokenIdParamSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  registerDeviceTokenSchema,
  updateNotificationPreferencesSchema,
} from "./notifications.schema";
import * as notificationsService from "./notifications.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function listNotifications(req: Request, res: Response) {
  const userId = requireUserId(req);
  const query = listNotificationsQuerySchema.parse(req.query);
  const result = await notificationsService.listNotifications(userId, query);
  res.status(200).json(result);
}

export async function getPreferences(req: Request, res: Response) {
  const userId = requireUserId(req);
  const preferences = await notificationsService.getNotificationPreferences(userId);
  res.status(200).json({ preferences });
}

export async function updatePreferences(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = updateNotificationPreferencesSchema.parse(req.body);
  const preferences = await notificationsService.updateNotificationPreferences(userId, input);
  res.status(200).json({
    message: "Notification preferences updated successfully",
    preferences,
  });
}

export async function registerDevice(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = registerDeviceTokenSchema.parse(req.body);
  const deviceToken = await notificationsService.registerDeviceToken(userId, input);
  res.status(201).json({
    message: "Device token registered successfully",
    device_token: deviceToken,
  });
}

export async function listDevices(req: Request, res: Response) {
  const userId = requireUserId(req);
  const deviceTokens = await notificationsService.listDeviceTokens(userId);
  res.status(200).json({ device_tokens: deviceTokens });
}

export async function revokeDevice(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = deviceTokenIdParamSchema.parse(req.params);
  const deviceToken = await notificationsService.revokeDeviceToken(userId, id);
  res.status(200).json({
    message: "Device token revoked successfully",
    device_token: deviceToken,
  });
}

export async function markRead(req: Request, res: Response) {
  const userId = requireUserId(req);
  const { id } = notificationIdParamSchema.parse(req.params);
  const notification = await notificationsService.markNotificationRead(userId, id);
  res.status(200).json({
    message: "Notification marked as read",
    notification,
  });
}

export async function markAllRead(req: Request, res: Response) {
  const userId = requireUserId(req);
  const updatedCount = await notificationsService.markAllNotificationsRead(userId);
  res.status(200).json({
    message: "Notifications marked as read",
    updated_count: updatedCount,
  });
}
