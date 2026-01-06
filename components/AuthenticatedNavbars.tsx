"use client";

import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";
import { useSession } from "next-auth/react";

export default function AuthenticatedNavbars() {
  const { data: session, status } = useSession();

  // Don't render anything while session is loading
  if (status === "loading") {
    return null;
  }

  // Only render navbars if user is authenticated
  if (session && session.user) {
    return (
      <>
        <Navbar />
        <BottomNavbar />
      </>
    );
  }

  // Return null if not authenticated
  return null;
}
