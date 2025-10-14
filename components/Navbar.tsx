"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "./AppIcon";
import { Button } from "./ui/button";

const Navbar = () => {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getPageTitle = () => {
    switch (pathname) {
      case "/dashboard":
        return null; // Show logo
      case "/search-rides":
        return "Find Rides";
      case "/post-a-ride":
        return "Post a Ride";
      case "/messages-chat":
        return "Messages";
      case "/payment-transactions":
        return "Payments";
      case "/profile-settings":
        return "Profile";
      default:
        return "Petrol Partner";
    }
  };

  const isHomePage = pathname === "/dashboard";

  return (
    <header className="sticky top-0 left-0 right-0 bg-card border-b border-border z-100 shadow-card">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left */}
        <div className="flex items-center">
          {isHomePage ? (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Icon name="Car" size={20} color="white" />
              </div>
              <span className="text-xl font-semibold text-foreground">
                Petrol Partner
              </span>
            </div>
          ) : (
            <h1 className="text-lg font-medium text-foreground">
              {getPageTitle()}
            </h1>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="icon">
            <Icon name="Bell" size={20} />
            <span className="-top-1 -right-1 w-2 h-2 bg-error rounded-full"></span>
          </Button>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                <Icon name="User" size={16} />
              </div>
            </Button>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 w-48 bg-popover border border-border rounded-lg shadow-medium z-200">
                <div className="py-2">
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center space-x-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon name="Settings" size={16} />
                    <span>Settings</span>
                  </button>
                  <hr className="my-2 border-border" />
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-error hover:bg-muted flex items-center space-x-2"
                    // onClick={() => signOut()}
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
          className="fixed inset-0 z-60"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
