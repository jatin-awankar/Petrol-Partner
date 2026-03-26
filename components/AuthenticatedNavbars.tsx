"use client";

import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

export default function AuthenticatedNavbars() {
  const { user, loading } = useCurrentUser();

  if (loading) {
    return null;
  }

  if (user) {
    return (
      <>
        <Navbar />
        <BottomNavbar />
      </>
    );
  }

  return null;
}
