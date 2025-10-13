import React, { useState } from "react";
import Icon from "../AppIcon";
import { Button } from "./button";
import { MapPin, MessageSquare, Phone } from "lucide-react";

interface EmergencyAccessButtonProps {
  onEmergencyCall?: () => void;
  onShareLocation?: () => void;
  onContactSupport?: () => void;
  isVisible?: boolean;
  className?: string;
}

const EmergencyAccessButton: React.FC<EmergencyAccessButtonProps> = ({
  onEmergencyCall = () => {},
  onShareLocation = () => {},
  onContactSupport = () => {},
  isVisible = true,
  className = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible) return null;

  const handleMainButtonClick = () => {
    if (isExpanded) {
      // Direct emergency call if already expanded
      try {
        onEmergencyCall?.();
      } catch (err) {
        console.error("Error during emergency call:", err);
      }
    } else {
      setIsExpanded(true);
    }
  };

  const handleOptionClick = (action: () => void) => {
    try {
      action?.();
    } catch (err) {
      console.error("Error executing action:", err);
    } finally {
      setIsExpanded(false);
    }
  };

  return (
    <div
      className={`fixed bottom-20 right-4 z-50 md:bottom-6 backdrop-blur-md ${className}`}
    >
      {/* Emergency Options */}
      {isExpanded && (
        <div className="mb-3 space-y-2 animate-slide-up">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleOptionClick(onEmergencyCall)}
            className="w-full justify-start shadow-strong"
          >
            <Phone />
            Call 911
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOptionClick(onShareLocation)}
            className="w-full justify-start bg-card shadow-strong"
          >
            <MapPin />
            Share Location
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOptionClick(onContactSupport)}
            className="w-full justify-start bg-card shadow-strong"
          >
            <MessageSquare />
            Contact Support
          </Button>
        </div>
      )}

      {/* Main Emergency Button */}
      <div className="relative">
        <Button
          variant="destructive"
          size="icon"
          onClick={handleMainButtonClick}
          className={`w-14 h-14 rounded-full shadow-strong transition-transform duration-200 ${
            isExpanded ? "rotate-45" : "hover:scale-105"
          }`}
          aria-label="Emergency"
        >
          <Icon
            name={isExpanded ? "X" : "AlertTriangle"}
            size={24}
            strokeWidth={2.5}
          />
        </Button>

        {/* Pulse animation when not expanded */}
        {!isExpanded && (
          <div className="absolute inset-0 rounded-full bg-error animate-ping opacity-20"></div>
        )}
      </div>

      {/* Click outside to close */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
};

export default EmergencyAccessButton;
