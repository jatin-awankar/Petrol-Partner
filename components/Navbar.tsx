"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Icon from "./AppIcon";
import { Button } from "./ui/button";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";
import { frontendConfig } from "@/lib/frontend-config";
import { cn } from "@/lib/utils";

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { logout, user } = useCurrentUser();

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home" },
    { label: "Search", path: "/search-rides", icon: "Search" },
    { label: "Post", path: "/post-a-ride", icon: "Plus" },
    { label: "Payments", path: "/payment-transactions", icon: "CreditCard" },
    ...(frontendConfig.flags.enableChatUi
      ? [{ label: "Messages", path: "/messages-chat", icon: "MessageCircle" as const }]
      : []),
  ];

  const isActive = (path: string) => pathname === path;

  const getPageText = () => {
    switch (pathname) {
      case "/dashboard":
        return "Dashboard";
      case "/search-rides":
        return "Find Rides";
      case "/post-a-ride":
        return "Post Ride";
      case "/messages-chat":
        return "Messages";
      case "/profile-settings":
        return "Profile";
      case "/payment-transactions":
        return "Payments";
      default:
        return "Petrol Partner";
    }
  };

  const userInitial = user?.full_name?.trim()?.[0]?.toUpperCase() ?? "U";

  const handleLogout = async () => {
    try {
      setIsMenuOpen(false);
      await logout();
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
        <div
          className="flex cursor-pointer items-center gap-3 select-none"
          onClick={() => router.push("/dashboard")}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-soft">
            <Icon name="Bike" size={20} color="white" />
          </div>
          <div className="hidden sm:flex sm:flex-col sm:leading-tight">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Petrol Partner
            </span>
            <span className="text-xs text-muted-foreground">{getPageText()}</span>
          </div>
        </div>

        <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1 shadow-sm md:flex">
          {navigationItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all",
                isActive(item.path)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon
                name={item.icon}
                size={16}
                strokeWidth={isActive(item.path) ? 2.5 : 2}
              />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full border border-border/70 bg-card/70 hover:bg-muted/70"
            aria-label="Notifications"
          >
            <Icon name="Bell" size={18} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-error rounded-full" />
          </Button>

          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="h-9 gap-2 rounded-full border-border/70 bg-card/80 px-2.5 hover:bg-muted/80"
              aria-label="Profile menu"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {userInitial}
              </span>
              <Icon name="ChevronDown" size={14} className="text-muted-foreground" />
            </Button>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-xl">
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-medium text-popover-foreground">
                    {user?.full_name ?? "Account"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.email ?? "Signed in"}
                  </p>
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="space-y-1">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
                    onClick={() => {
                      setIsMenuOpen(false);
                      router.push("/profile-settings");
                    }}
                  >
                    <Icon name="Settings" size={16} />
                    <span>Settings</span>
                  </button>

                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-muted"
                    onClick={handleLogout}
                  >
                    <Icon name="LogOut" size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
