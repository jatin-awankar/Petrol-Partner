
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./AppIcon";

const BottomNavbar = () => {
  const pathname = usePathname();
  const router = useRouter();

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home" },
    { label: "Search", path: "/search-rides", icon: "Search" },
    { label: "Post", path: "/post-a-ride", icon: "Plus", isCenter: true },
    { label: "Messages", path: "/messages-chat", icon: "MessageCircle", badge: 2 },
    { label: "Profile", path: "/profile-settings", icon: "User" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] md:hidden backdrop-blur-xl bg-card/90 border-t border-border 
      shadow-lg pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center transition-all duration-200 cursor-pointer
                ${
                  item.isCenter
                    ? "translate-y-[-18%]"
                    : "opacity-90 hover:opacity-100"
                }
                ${isActive ? "text-primary scale-105" : "text-muted-foreground"}
              `}
            >
              <div
                className={`relative flex items-center justify-center 
                  ${item.isCenter ? "bg-gradient-hero text-white rounded-full w-14 h-14 shadow-lg" : ""}
                `}
              >
                <Icon
                  name={item.icon}
                  size={item.isCenter ? 24 : 22}
                  strokeWidth={isActive ? 2.5 : 2}
                />

                {/* 🔴 Notification Badge */}
                {item.badge && !item.isCenter && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-error text-error-foreground text-[10px] font-semibold rounded-full flex items-center justify-center px-[3px] shadow-md">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              {!item.isCenter && (
                <span
                  className={`text-[11px] mt-1 font-medium tracking-tight ${
                    isActive ? "text-primary" : "text-muted-foreground"
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
