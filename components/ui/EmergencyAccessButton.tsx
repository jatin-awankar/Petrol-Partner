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
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  };

  const handleOptionClick = (action: () => void) => {
    console.log("Emergency option clicked");
    try {
      action?.();
    } catch (err) {
      console.error("Error executing action:", err);
    }
  };
  console.log("Emergency Button rendered, isVisible:", isVisible);

  return (
    <>
      {/* Overlay for closing when clicking outside */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Emergency Button + Options container */}
      <div className={`fixed bottom-20 right-4 z-50 md:bottom-6 ${className}`}>
        {/* Emergency Options */}
        {isExpanded && (
          <div
            className="mb-3 space-y-2 transition-all duration-200 transform translate-y-1"
            onClick={(e) => e.stopPropagation()} // stops overlay from closing menu
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleOptionClick(onEmergencyCall)}
              className="w-full justify-start shadow-strong gap-2 backdrop-blur-md"
            >
              <Phone />
              Call 911
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptionClick(onShareLocation)}
              className="w-full justify-start bg-card shadow-strong backdrop-blur-md"
            >
              <MapPin />
              Share Location
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptionClick(onContactSupport)}
              className="w-full justify-start bg-card shadow-strong backdrop-blur-md"
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
            size="lg"
            onClick={handleMainButtonClick}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsExpanded(false);
            }}
            className="relative z-50 w-14 h-14 rounded-full shadow-strong transition-transform duration-200 backdrop-blur-md"
            aria-label="Emergency"
          >
            <Icon
              name={isExpanded ? "X" : "AlertTriangle"}
              size={16}
              strokeWidth={2.5}
            />
          </Button>

          {/* Pulse animation when not expanded */}
          {!isExpanded && (
            <div className="absolute inset-0 rounded-full bg-error animate-ping opacity-20"></div>
          )}
        </div>
      </div>
    </>
  );
};

export default EmergencyAccessButton;
