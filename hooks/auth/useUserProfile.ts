"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getProfileMe, updateProfileMe } from "@/lib/api/backend";
import { useCurrentUser } from "./useCurrentUser";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  college?: string;
  profile_image?: string;
  date_of_birth?: string | null;
  gender_for_matching?: "female" | "male" | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  address?: string | null;
  is_verified: boolean;
  role: string;
  created_at: string;
  updated_at?: string;
  avg_rating?: number;
}

export const useUserProfile = () => {
  const { refreshUser } = useCurrentUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setError(null);

    try {
      const nextProfile = await getProfileMe();
      setProfile(nextProfile);
      return nextProfile;
    } catch (err: any) {
      setError(err?.message || "Error fetching profile");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(
    async (input: Partial<UserProfile>) => {
      setError(null);

      const payload = {
        full_name: input.full_name ?? undefined,
        phone: input.phone ?? undefined,
        college: input.college ?? undefined,
        avatar_url: input.profile_image ?? undefined,
        date_of_birth: input.date_of_birth ?? undefined,
        gender_for_matching: input.gender_for_matching ?? undefined,
        emergency_contact_name: input.emergency_contact_name ?? undefined,
        emergency_contact_phone: input.emergency_contact_phone ?? undefined,
        address: input.address ?? undefined,
      };

      try {
        const nextProfile = await updateProfileMe(payload);
        setProfile(nextProfile);
        await refreshUser().catch(() => undefined);
        return nextProfile;
      } catch (err: any) {
        setError(err?.message || "Failed to update profile");
        throw err;
      }
    },
    [refreshUser],
  );

  useEffect(() => {
    void fetchProfile().catch(() => undefined);
  }, [fetchProfile]);

  useEffect(() => {
    const onFocus = () => {
      void fetchProfile().catch(() => undefined);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProfile]);

  return {
    profile: useMemo(() => profile, [profile]),
    loading,
    error,
    fetchProfile,
    updateProfile,
  };
};
