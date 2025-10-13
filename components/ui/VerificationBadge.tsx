"use client";
import React, { useState } from "react";
import Icon from "../AppIcon";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

interface VerificationBadgeProps {
  isVerified?: boolean;
  verificationType?: "college" | "driver" | "identity";
  size?: number;
  showTooltip?: boolean;
  className?: string;
}

const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  isVerified = false,
  verificationType = "college",
  size = 24,
  showTooltip = true,
  className = "",
}) => {
  const [showTooltipState, setShowTooltipState] = useState(false);

  if (!isVerified) return null;

  const sizeMap = {
    sm: { container: "w-4 h-4", icon: 12 },
    default: { container: "w-5 h-5", icon: 14 },
    lg: { container: "w-6 h-6", icon: 18 },
  };

  const verificationConfig = {
    college: {
      icon: "BadgeCheck",
      color: "",
      tooltip: "College Verified",
      description: "Student status confirmed",
    },
    driver: {
      icon: "Bike",
      color: "bg-success-foreground text-success",
      tooltip: "Driver Verified",
      description: "License and vehicle verified",
    },
    identity: {
      icon: "Shield",
      color: " bg-primary-foreground text-primary",
      tooltip: "Identity Verified",
      description: "Government ID verified",
    },
  };

  const config = verificationConfig[verificationType];

  return (
    <div className="relative inline-block">
      {/* Badge */}
      <div
        className={clsx(
          "rounded-full flex items-center justify-center transition-transform hover:scale-105 duration-150",
          config.color
        )}
        onMouseEnter={() => showTooltip && setShowTooltipState(true)}
        onMouseLeave={() => setShowTooltipState(false)}
        role="img"
        aria-label={config.tooltip}
      >
        <Icon name={config.icon} size={size} className={className} />
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && showTooltipState && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
          >
            <div className="bg-popover border border-border rounded-lg shadow-md p-2 whitespace-nowrap">
              <p className="text-sm font-medium text-foreground">
                {config.tooltip}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.description}
              </p>
            </div>
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VerificationBadge;
