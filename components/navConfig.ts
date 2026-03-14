"use client";

export type NavItem = {
  label: string;
  path: string;
  icon: string;
  highlight?: boolean;
};

export const DESKTOP_NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "/dashboard", icon: "LayoutDashboard" },
  { label: "Find Ride", path: "/search-rides", icon: "Search" },
  { label: "Offer Ride", path: "/post-a-ride", icon: "PlusCircle" },
  { label: "Messages", path: "/messages-chat", icon: "MessageCircle" },
  { label: "Profile", path: "/profile-settings", icon: "UserRound" },
];

export const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "/dashboard", icon: "House" },
  { label: "Find", path: "/search-rides", icon: "Search" },
  { label: "Offer", path: "/post-a-ride", icon: "PlusCircle", highlight: true },
  { label: "Chats", path: "/messages-chat", icon: "MessageCircle" },
  { label: "You", path: "/profile-settings", icon: "UserRound" },
];

export function isActivePath(pathname: string, path: string): boolean {
  if (path === "/dashboard") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getNavPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Your Rides";
  if (pathname.startsWith("/search-rides")) return "Find Ride";
  if (pathname.startsWith("/post-a-ride")) return "Offer Ride";
  if (pathname.startsWith("/messages-chat")) return "Messages";
  if (pathname.startsWith("/profile-settings")) return "Profile";
  if (pathname.startsWith("/payments")) return "Payments";
  return "Petrol Partner";
}
