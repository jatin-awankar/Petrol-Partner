"use client";

import { useCallback, useMemo, useState } from "react";

import { useCurrentUser } from "./useCurrentUser";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  college?: string;
  profile_image?: string;
  is_verified: boolean;
  role: string;
  created_at: string;
  updated_at?: string;
  avg_rating?: number;
}

export const useUserProfile = () => {
  const { user, loading, refreshUser } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setError(null);

    try {
      await refreshUser();
    } catch (err: any) {
      setError(err?.message || "Error fetching profile");
    }
  }, [refreshUser]);

  const updateProfile = useCallback(async () => {
    setError("Profile updates are not available in the new backend yet.");
    throw new Error("Profile updates are not available in the new backend yet.");
  }, []);

  const profile = useMemo<UserProfile | null>(
    () => (user ? { ...user } : null),
    [user],
  );

  return { profile, loading, error, fetchProfile, updateProfile };
};
