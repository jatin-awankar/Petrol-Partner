// app/hooks/auth/useUserProfile.ts
'use client';
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

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
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    if (status === "loading") return; // wait for session
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/me", {
        credentials: "include", // Include cookies for NextAuth session
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
  }, [session, status]);

  // Update profile
  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!session) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/user/update", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // Include cookies for NextAuth session
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
    [session]
  );

  // Auto-fetch when session changes
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, error, fetchProfile, updateProfile };
};
