"use client";

import React from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";
import { Button } from "../ui/button";

interface SafetyPanelProps {
  onEmergencyContact?: () => void;
  onShareLocation?: () => void;
  onReportIssue?: () => void;
  safetyTips?: string[];
  isLoading?: boolean;
}

const SafetyPanel: React.FC<SafetyPanelProps> = ({
  onEmergencyContact,
  onShareLocation,
  onReportIssue,
  safetyTips = [
    "Verify profile and vehicle before boarding",
    "Share ride details with trusted contacts",
    "Keep your phone charged and location enabled",
    "Report unusual behavior immediately",
  ],
  isLoading = false,
}) => {
  const actions = [
    {
      icon: "Phone",
      title: "Emergency",
      description: "Call emergency services quickly.",
      action: onEmergencyContact,
      variant: "destructive",
    },
    {
      icon: "MapPinned",
      title: "Share live location",
      description: "Notify trusted contacts in one tap.",
      action: onShareLocation,
      variant: "outline",
    },
    {
      icon: "Flag",
      title: "Report issue",
      description: "Report concerns to support.",
      action: onReportIssue,
      variant: "outline",
    },
  ];

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 md:p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-4">
        {isLoading ? (
          <Skeleton circle height={20} width={20} />
        ) : (
          <Icon name="ShieldCheck" size={18} className="text-success" />
        )}
        <h3 className="text-base md:text-lg font-semibold text-foreground">
          {isLoading ? <Skeleton width={150} /> : "Safety and support"}
        </h3>
      </div>

      <div className="space-y-2.5">
        {(isLoading ? Array.from({ length: 3 }) : actions).map(
          (item: any, idx: number) => (
            <div
              key={idx}
              className="rounded-xl border border-border/70 bg-card/90 p-3"
            >
              {isLoading ? (
                <Skeleton height={52} />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Button
                    variant={
                      item.variant as "default" | "destructive" | "outline"
                    }
                    size="sm"
                    onClick={item.action}
                    className="shrink-0"
                  >
                    <Icon name={item.icon} size={14} />
                    {item.title}
                  </Button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {!isLoading && safetyTips.length > 0 && (
        <div className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="text-sm font-medium text-success mb-1">Ride safely</p>
          <ul className="space-y-1">
            {safetyTips.map((tip, idx) => (
              <li
                key={idx}
                className="text-xs text-foreground flex items-start gap-1.5"
              >
                <Icon name="Dot" size={14} className="mt-0.5" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default SafetyPanel;
