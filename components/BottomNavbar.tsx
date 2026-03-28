"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";

import Icon from "./AppIcon";
import { frontendConfig } from "@/lib/frontend-config";
import { cn } from "@/lib/utils";

const BottomNavbar = () => {
  const pathname = usePathname();
  const router = useRouter();

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home" },
    { label: "Search", path: "/search-rides", icon: "Search" },
    { label: "Post", path: "/post-a-ride", icon: "Plus", isCenter: true },
    ...(frontendConfig.flags.enableChatUi
      ? [
          {
            label: "Messages",
            path: "/messages-chat",
            icon: "MessageCircle",
            badge: 2,
          },
        ]
      : [
          {
            label: "Payments",
            path: "/payments",
            icon: "CreditCard",
          },
        ]),
    { label: "Profile", path: "/profile-settings", icon: "User" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden" aria-label="Bottom navigation">
      <div className="mx-auto w-full max-w-xl px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex h-16 items-center justify-between rounded-2xl border border-border/80 bg-card/95 px-2 shadow-card backdrop-blur-xl">
          {navigationItems.map((item) => {
            const isActive = pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center transition-all duration-200",
                  item.isCenter ? "-mt-9" : "min-w-[62px]",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "relative flex items-center justify-center",
                    item.isCenter
                      ? "h-14 w-14 rounded-2xl bg-gradient-primary text-primary-foreground shadow-soft"
                      : "h-9 w-9 rounded-xl transition-colors",
                    !item.isCenter && isActive
                      ? "bg-accent text-accent-foreground"
                      : !item.isCenter
                        ? "hover:bg-muted/70"
                        : "",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={item.isCenter ? 23 : 20}
                    strokeWidth={isActive ? 2.5 : 2}
                  />

                  {item.badge && !item.isCenter ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-[3px] text-[10px] font-semibold text-error-foreground shadow-md">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </div>

                {!item.isCenter ? (
                  <span
                    className={`mt-1 text-[11px] font-medium tracking-tight ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavbar;
