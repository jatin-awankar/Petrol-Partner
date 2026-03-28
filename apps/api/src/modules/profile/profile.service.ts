import { withTransaction } from "../../db/transaction";
import { AppError } from "../../shared/errors/app-error";
import type {
  UpdatePreferencesInput,
  UpdateProfileInput,
  UpdateSafetyInput,
} from "./profile.schema";
import * as profileRepo from "./profile.repo";

const DEFAULT_PREFERENCES = {
  musicPreference: "any",
  smokingPolicy: "no-smoking",
  chattiness: "moderate",
  notifications: {
    rideMatches: true,
    messages: true,
    payments: true,
    promotions: false,
  },
  privacy: {
    showProfile: true,
    shareRideHistory: true,
    shareLocation: true,
  },
  autoAccept: {
    highRatedUsers: false,
    sameCollege: false,
  },
};

const DEFAULT_SAFETY = {
  trustedContacts: [] as Array<Record<string, unknown>>,
  settings: {
    autoShareRideDetails: true,
    enableLocationTracking: true,
    requireDriverVerification: true,
    safetyCheckIns: true,
  },
};

function normalizePreferences(input: Record<string, unknown> | null) {
  return {
    ...DEFAULT_PREFERENCES,
    ...(input ?? {}),
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...((input?.notifications as Record<string, unknown> | undefined) ?? {}),
    },
    privacy: {
      ...DEFAULT_PREFERENCES.privacy,
      ...((input?.privacy as Record<string, unknown> | undefined) ?? {}),
    },
    autoAccept: {
      ...DEFAULT_PREFERENCES.autoAccept,
      ...((input?.autoAccept as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function normalizeSafety(input: {
  trusted_contacts: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
} | null) {
  return {
    trustedContacts: Array.isArray(input?.trusted_contacts)
      ? input!.trusted_contacts
      : DEFAULT_SAFETY.trustedContacts,
    settings: {
      ...DEFAULT_SAFETY.settings,
      ...((input?.settings ?? {}) as Record<string, unknown>),
    },
  };
}

export async function getProfile(userId: string) {
  const profile = await profileRepo.findProfileByUserId(userId);

  if (!profile) {
    throw new AppError(404, "Profile not found", "PROFILE_NOT_FOUND");
  }

  return profile;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const updated = await withTransaction(async (client) => {
    return profileRepo.updateProfileByUserId(userId, input, client);
  });

  if (!updated) {
    throw new AppError(404, "Profile not found", "PROFILE_NOT_FOUND");
  }

  return updated;
}

export async function getPreferences(userId: string) {
  const preferences = await profileRepo.getPreferencesByUserId(userId);
  return normalizePreferences(preferences);
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput) {
  return withTransaction(async (client) => {
    const current = await profileRepo.getPreferencesByUserId(userId, client);
    const merged = normalizePreferences({
      ...(current ?? {}),
      ...input,
      notifications: {
        ...((current?.notifications as Record<string, unknown> | undefined) ?? {}),
        ...((input.notifications as Record<string, unknown> | undefined) ?? {}),
      },
      privacy: {
        ...((current?.privacy as Record<string, unknown> | undefined) ?? {}),
        ...((input.privacy as Record<string, unknown> | undefined) ?? {}),
      },
      autoAccept: {
        ...((current?.autoAccept as Record<string, unknown> | undefined) ?? {}),
        ...((input.autoAccept as Record<string, unknown> | undefined) ?? {}),
      },
    });

    const stored = await profileRepo.upsertPreferencesByUserId(userId, merged, client);
    return normalizePreferences(stored);
  });
}

export async function getSafety(userId: string) {
  const safety = await profileRepo.getSafetyByUserId(userId);
  return normalizeSafety(safety);
}

export async function updateSafety(userId: string, input: UpdateSafetyInput) {
  return withTransaction(async (client) => {
    const current = await profileRepo.getSafetyByUserId(userId, client);
    const normalizedCurrent = normalizeSafety(current);
    const merged = {
      trustedContacts: input.trustedContacts ?? normalizedCurrent.trustedContacts,
      settings: {
        ...normalizedCurrent.settings,
        ...((input.settings as Record<string, unknown> | undefined) ?? {}),
      },
    };

    const stored = await profileRepo.upsertSafetyByUserId(
      userId,
      {
        trustedContacts: merged.trustedContacts,
        settings: merged.settings,
      },
      client,
    );

    return normalizeSafety(stored);
  });
}

export async function getSecurity(userId: string) {
  const activity = await profileRepo.listLoginActivityByUserId(userId, 20);

  return {
    password_last_changed_at: null,
    two_factor: {
      enabled: false,
      method: null,
      supported: false,
    },
    login_activity: activity,
  };
}
