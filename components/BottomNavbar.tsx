"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./AppIcon";

const BottomNavbar = () => {
  const pathname = usePathname();
  const router = useRouter();

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home", badge: null },
    { label: "Search", path: "/ride-details-booking", icon: "Search", badge: null },
    { label: "Post", path: "/post-a-ride", icon: "Plus", badge: null },
    { label: "Messages", path: "/messages-chat", icon: "MessageCircle", badge: 3 },
    { label: "Account", path: "/profile-account-settings", icon: "User", badge: null },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-100 md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center justify-center flex-1 py-2 px-1 transition-colors duration-200 ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon name={item.icon} size={20} strokeWidth={isActive ? 2.5 : 2} />
                {item.badge && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-error text-error-foreground text-xs font-medium rounded-full flex items-center justify-center px-1">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-xs mt-1 font-medium truncate ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavbar;
