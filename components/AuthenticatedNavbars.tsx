"use client";

import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { usePathname } from "next/navigation";

const HIDE_NAVBAR_PATHS = new Set([
  "/",
  "/login",
  "/register",
]);

export default function AuthenticatedNavbars() {
  const pathname = usePathname();
  const { user, loading } = useCurrentUser();
  const hideNavbars = HIDE_NAVBAR_PATHS.has(pathname);

  if (loading) {
    return null;
  }

  if (user && !hideNavbars) {
    return (
      <>
        <Navbar />
        <BottomNavbar />
      </>
    );
  }

  return null;
}
