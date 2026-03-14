"use client";

import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const HIDDEN_AUTH_ROUTES = new Set(["/login", "/register"]);

export default function AuthenticatedNavbars() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  if (HIDDEN_AUTH_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <>
      <Navbar />
      <BottomNavbar />
    </>
  );
}
