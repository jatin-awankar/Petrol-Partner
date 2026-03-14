"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";

import Icon from "./AppIcon";
import { Button } from "./ui/button";
import {
  DESKTOP_NAV_ITEMS,
  getNavPageTitle,
  isActivePath,
} from "./navConfig";

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const pageTitle = useMemo(() => getNavPageTitle(pathname), [pathname]);
  const firstName = session?.user?.name?.trim().split(" ")[0] || "Student";
  const avatarLetter = firstName[0]?.toUpperCase() || "S";

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  const isDarkMode = mounted
    ? (resolvedTheme || theme) === "dark"
    : false;

  const handleLogout = async () => {
    setIsMenuOpen(false);
    try {
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleThemeToggle = () => {
    setTheme(isDarkMode ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 left-0 right-0 z-50 border-b border-border/80 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 md:px-6 xl:px-10">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-muted/60"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
            <Icon name="Bike" size={19} />
          </span>
          <div className="hidden text-left sm:block">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Petrol Partner
            </p>
            <p className="text-sm font-semibold text-foreground">{pageTitle}</p>
          </div>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {DESKTOP_NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => router.push(item.path)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                <Icon name={item.icon} size={16} strokeWidth={active ? 2.4 : 2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3" ref={menuRef}>
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/search-rides")}
            >
              <Icon name="Search" size={15} />
              Find Ride
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => router.push("/post-a-ride")}
            >
              <Icon name="PlusCircle" size={15} />
              Offer Ride
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
            className="rounded-full bg-muted/80"
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
            title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            {mounted ? (
              <Icon name={isDarkMode ? "Sun" : "Moon"} size={17} />
            ) : (
              <span className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="relative rounded-full bg-muted"
            aria-label="Open profile menu"
            aria-expanded={isMenuOpen}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {avatarLetter}
            </span>
          </Button>

          {isMenuOpen && (
            <div className="absolute right-4 top-14 w-64 rounded-xl border border-border bg-popover/95 p-2 shadow-lg backdrop-blur-xl md:right-6 xl:right-10">
              <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{session.user.name || "Student"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {session.user.email || "No email available"}
                </p>
              </div>

              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => router.push("/payments")}
                >
                  <Icon name="CreditCard" size={15} />
                  Payments
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => router.push("/profile-settings")}
                >
                  <Icon name="Settings" size={15} />
                  Account Settings
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={handleThemeToggle}
                >
                  <Icon name={isDarkMode ? "Sun" : "Moon"} size={15} />
                  {isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <Icon name="LogOut" size={15} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
