"use client";

import { useAuth } from "@/app/providers/AuthProvider";

export function useCurrentUser() {
  return useAuth();
}
