// components/messages/SafetyReminder.tsx
"use client";
import React from "react";
import Icon from "../AppIcon";
import { Button } from "../ui/button";

interface SafetyReminderProps {
  onDismiss?: () => void;
}

const SafetyReminder: React.FC<SafetyReminderProps> = ({ onDismiss }) => {
  return (
    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <Icon name="Shield" size={20} className="text-warning" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground mb-2">
            Stay Safe While Messaging
          </h4>

          <ul className="text-xs text-muted-foreground space-y-1 mb-3">
            <li className="flex items-start space-x-2">
              <Icon
                name="Check"
                size={12}
                className="text-success mt-0.5 flex-shrink-0"
              />
              <span>Keep conversations ride-related</span>
            </li>
            <li className="flex items-start space-x-2">
              <Icon
                name="Check"
                size={12}
                className="text-success mt-0.5 flex-shrink-0"
              />
              <span>Don&apos;t share personal information</span>
            </li>
            <li className="flex items-start space-x-2">
              <Icon
                name="Check"
                size={12}
                className="text-success mt-0.5 flex-shrink-0"
              />
              <span>Report inappropriate behavior</span>
            </li>
            <li className="flex items-start space-x-2">
              <Icon
                name="Check"
                size={12}
                className="text-success mt-0.5 flex-shrink-0"
              />
              <span>Meet in public campus areas</span>
            </li>
          </ul>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => console.log("View safety guidelines")}
              className="text-xs"
            >
              Safety Guidelines
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-xs text-muted-foreground"
            >
              Got it
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="flex-shrink-0 w-6 h-6"
        >
          <Icon name="X" size={14} />
        </Button>
      </div>
    </div>
  );
};

export default SafetyReminder;
