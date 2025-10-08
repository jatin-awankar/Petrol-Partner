"use client"; // client component

import React from "react";
import Navbar from "@/components/Navbar";
import BottomNavbar from "@/components/BottomNavbar";

export default function AuthenticatedNavbars() {
  return (
    <>
    {/* <SignedIn> */}
      <Navbar />
      <BottomNavbar />
    {/* </SignedIn> */}
    </>
  );
}
