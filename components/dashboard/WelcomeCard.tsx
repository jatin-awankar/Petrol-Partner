"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabaseClient } from "@/lib/supabase/client";
import {
  GraduationCap,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";

interface Profile {
  id: string;
  full_name: string | null;
  college: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export default function WelcomeCard() {
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const currentHour = new Date().getHours();
  const getGreeting = () => {
    if (currentHour < 12) return "Good morning";
    if (currentHour < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const fetchProfile = async () => {
      setLoading(true);
      const { data, error } = await supabaseClient
        .from("user_profiles")
        .select("id, full_name, college, avatar_url, is_verified")
        .eq("clerk_id", user?.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error
        });
      } else if (isMounted && data) {
        setProfile(data);
      }

      if (isMounted) setLoading(false);
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white mb-6 animate-pulse">
        <div className="h-6 w-40 bg-white/30 rounded mb-4"></div>
        <div className="h-4 w-32 bg-white/20 rounded"></div>
      </div>
    );
  }

  // if (!profile) return null;

  const displayName =
    profile?.full_name && profile?.full_name.trim().length > 0
      ? profile.full_name
      : "Student";

  const displayCollege =
    profile?.college && profile?.college.trim().length > 0
      ? profile.college
      : "College not set";

  return (
    <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-6 text-white mb-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold mb-1">
            {getGreeting()}, {displayName}!
          </h1>
          <div className="flex items-center space-x-2">
            <p className="text-primary-foreground/80 text-sm">
              {displayCollege}
            </p>
            {profile?.is_verified ? (
              <ShieldCheck size="16" />
            ) : (
              <ShieldAlert size="16" />
            )}
          </div>
        </div>

        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
          {profile?.avatar_url ? (
            <Image
              src={profile?.avatar_url}
              alt={displayName}
              width={64}
              height={64}
              className="rounded-full object-cover"
            />
          ) : (
            <GraduationCap size={32} color="white" />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center space-x-4 text-sm">
        <div className="flex items-center space-x-1">
          <MapPin size={16} />
          <span>Campus Area</span>
        </div>
        <div className="flex items-center space-x-1">
          <Users size={16} />
          <span>2,847 active students</span>
        </div>
      </div>
    </div>
  );
}
