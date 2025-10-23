// app/hooks/auth/useUserProfile.ts
'use client';
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

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
  const { token } = useAuth(); // ✅ token from context
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (!token) return; // wait for token

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch profile");
      }

      const data = await res.json();
      setProfile(data.user);
    } catch (err: any) {
      setError(err.message || "Error fetching profile");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Update profile
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!token) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/user/me", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update profile");
        }

        const data = await res.json();
        setProfile(data.user || data); // update local state
      } catch (err: any) {
        setError(err.message || "Error updating profile");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Auto-fetch when token changes
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, error, fetchProfile, updateProfile };
};
