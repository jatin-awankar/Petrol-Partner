"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import Icon from "./AppIcon";
import { MOBILE_NAV_ITEMS, isActivePath } from "./navConfig";

const BottomNavbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-card/92 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex h-16 max-w-[560px] items-center justify-around px-2">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.path);

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => router.push(item.path)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-[56px] flex-col items-center justify-center rounded-lg transition-all duration-200 ${
                item.highlight ? "-translate-y-2" : ""
              } ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`inline-flex items-center justify-center ${
                  item.highlight
                    ? "h-12 w-12 rounded-full bg-gradient-primary text-white shadow-soft"
                    : "h-9 w-9 rounded-lg"
                }`}
              >
                <Icon
                  name={item.icon}
                  size={item.highlight ? 22 : 20}
                  strokeWidth={active ? 2.4 : 2}
                />
              </span>

              {!item.highlight && (
                <span
                  className={`mt-0.5 text-[11px] font-medium ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavbar;
