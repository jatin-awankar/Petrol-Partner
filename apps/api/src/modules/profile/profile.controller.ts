import type { Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import {
  updatePreferencesSchema,
  updateProfileSchema,
  updateSafetySchema,
} from "./profile.schema";
import * as profileService from "./profile.service";

function requireUserId(req: Request) {
  if (!req.user) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  return req.user.userId;
}

export async function getMe(req: Request, res: Response) {
  const userId = requireUserId(req);
  const profile = await profileService.getProfile(userId);

  res.status(200).json({ profile });
}

export async function patchMe(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = updateProfileSchema.parse(req.body);
  const profile = await profileService.updateProfile(userId, input);

  res.status(200).json({
    message: "Profile updated successfully",
    profile,
  });
}

export async function getPreferences(req: Request, res: Response) {
  const userId = requireUserId(req);
  const preferences = await profileService.getPreferences(userId);

  res.status(200).json({ preferences });
}

export async function patchPreferences(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = updatePreferencesSchema.parse(req.body);
  const preferences = await profileService.updatePreferences(userId, input);

  res.status(200).json({
    message: "Preferences updated successfully",
    preferences,
  });
}

export async function getSafety(req: Request, res: Response) {
  const userId = requireUserId(req);
  const safety = await profileService.getSafety(userId);

  res.status(200).json({ safety });
}

export async function patchSafety(req: Request, res: Response) {
  const userId = requireUserId(req);
  const input = updateSafetySchema.parse(req.body);
  const safety = await profileService.updateSafety(userId, input);

  res.status(200).json({
    message: "Safety settings updated successfully",
    safety,
  });
}

export async function getSecurity(req: Request, res: Response) {
  const userId = requireUserId(req);
  const security = await profileService.getSecurity(userId);

  res.status(200).json({ security });
}
