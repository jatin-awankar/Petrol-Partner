"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./AppIcon";
import { Button } from "./ui/button";

const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navigationItems = [
    { label: "Home", path: "/dashboard", icon: "Home" },
    { label: "Search", path: "/search-rides", icon: "Search" },
    { label: "Post", path: "/post-a-ride", icon: "Plus" },
    { label: "Messages", path: "/messages-chat", icon: "MessageCircle" },
    { label: "Payments", path: "/payment-transactions", icon: "CreditCard" },
  ];

  const isActive = (path: string) => pathname === path;

  // Dynamic text based on route
  const getPageText = () => {
    switch (pathname) {
      case "/dashboard":
        return "Petrol Partner";
      case "/search-rides":
        return "Search a Ride";
      case "/post-a-ride":
        return "Post a Ride";
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

  return (
    <header className="sticky top-0 left-0 right-0 z-100 backdrop-blur-md bg-card/70 border-b border-border shadow-[0_1px_8px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between h-16 px-4 md:px-6 xl:px-12">
        {/* Left — Always show logo + dynamic text */}
        <div
          className="flex items-center space-x-2 cursor-pointer select-none"
          onClick={() => router.push("/dashboard")}
        >
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Icon name="Bike" size={20} color="white" />
          </div>
          <span className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
            {getPageText()}
          </span>
        </div>

        {/* Center — Desktop NavItems */}
        <nav className="hidden md:flex items-center space-x-6">
          {navigationItems.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex items-center space-x-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                isActive(item.path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                name={item.icon}
                size={18}
                strokeWidth={isActive(item.path) ? 2.5 : 2}
              />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Right — Notifications + Profile */}
        <div className="flex items-center space-x-3 md:space-x-4">
          {/* Notification */}
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-muted/60 transition"
          >
            <Icon name="Bell" size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-error rounded-full" />
          </Button>

          {/* Profile */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="rounded-full bg-muted hover:bg-muted/80 transition"
            >
              <Icon name="User" size={18} />
            </Button>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-48 bg-popover/90 backdrop-blur-md border border-border rounded-lg shadow-md z-200">
                <div className="py-2">
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center space-x-2"
                    onClick={() => {
                      setIsMenuOpen(false);
                      router.push("/profile-settings");
                    }}
                  >
                    <Icon name="Settings" size={16} />
                    <span>Settings</span>
                  </button>
                  <hr className="my-2 border-border" />
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-error hover:bg-muted flex items-center space-x-2"
                    onClick={() => {
                      setIsMenuOpen(false);
                      // handle sign-out logic here
                    }}
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

      {/* Overlay to close dropdown */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-60"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
