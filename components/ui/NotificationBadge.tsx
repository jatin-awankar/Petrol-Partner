"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface NotificationBadgeProps {
  count?: number;
  maxCount?: number;
  size?: "sm" | "default" | "lg";
  variant?: "error" | "warning" | "success" | "primary";
  className?: string;
  showZero?: boolean;
}

const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count = 0,
  maxCount = 99,
  size = "default",
  variant = "error",
  className = "",
  showZero = false,
}) => {
  const isVisible = showZero ? count >= 0 : count > 0;
  if (!isVisible) return null;

  const normalizedCount = Math.max(0, count || 0);
  const displayCount =
    normalizedCount > maxCount ? `${maxCount}+` : normalizedCount.toString();

  const sizeClasses = {
    sm: "min-w-[14px] h-[14px] text-[10px]",
    default: "min-w-[18px] h-[18px] text-xs",
    lg: "min-w-[22px] h-[22px] text-sm",
  }[size];

  const variantClasses = {
    error: "bg-error text-error-foreground",
    warning: "bg-warning text-warning-foreground",
    success: "bg-success text-success-foreground",
    primary: "bg-primary text-primary-foreground",
  }[variant];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.span
          key="badge"
          initial={{ opacity: 0, scale: 0.8, y: -2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -2 }}
          transition={{ duration: 0.2 }}
          className={clsx(
            "inline-flex items-center justify-center font-medium rounded-full px-1 select-none",
            sizeClasses,
            variantClasses,
            className
          )}
          aria-label={`${normalizedCount} notification${
            normalizedCount !== 1 ? "s" : ""
          }`}
        >
          {displayCount}
        </motion.span>
      )}
    </AnimatePresence>
  );
};

export default NotificationBadge;
