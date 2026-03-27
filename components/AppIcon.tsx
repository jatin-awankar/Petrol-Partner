// components/AppIcon.tsx
import React from "react";
import * as LucideIcons from "lucide-react";
import { HelpCircle } from "lucide-react";

type IconProps = {
  name: keyof typeof LucideIcons | string;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
  title?: string;
} & React.SVGProps<SVGSVGElement>;

const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = "currentColor",
  className = "",
  strokeWidth = 2,
  title,
  ...props
}) => {
  // Try to get the icon component from LucideIcons, falling back to HelpCircle if not found
  const IconComponent =
    (LucideIcons[name as keyof typeof LucideIcons] as React.FC<
      React.SVGProps<SVGSVGElement>
    >) || HelpCircle;

  if (!IconComponent) {
    // Fallback to HelpCircle icon
    return (
      <HelpCircle
        size={size}
        color="gray"
        strokeWidth={strokeWidth}
        className={className}
        aria-label={title || "Unknown icon"}
        {...props}
      />
    );
  }

  // Remove 'size' prop from IconComponent to fix type error
  return (
    <IconComponent
      width={size}
      height={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      aria-label={title}
      {...props}
    />
  );
};

export default Icon;
