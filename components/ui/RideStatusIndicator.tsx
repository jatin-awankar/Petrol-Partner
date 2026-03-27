import React from "react";
import Icon from "../AppIcon";

interface RideStatusIndicatorProps {
  status?:
    | "none"
    | "searching"
    | "matched"
    | "en-route"
    | "arrived"
    | "in-progress"
    | "completed";
  driverName?: string;
  estimatedTime?: string;
  onViewDetails?: () => void;
  onEmergency?: () => void;
}

const RideStatusIndicator: React.FC<RideStatusIndicatorProps> = ({
  status = "none",
  driverName = "",
  estimatedTime = "",
  onViewDetails = () => {},
  onEmergency = () => {},
}) => {
  if (status === "none") return null;

  const getStatusConfig = () => {
    switch (status) {
      case "searching":
        return {
          icon: "Search",
          text: "Finding rides...",
          color: "text-warning",
          bgColor: "bg-warning/10",
          borderColor: "border-warning/20",
        };
      case "matched":
        return {
          icon: "CheckCircle",
          text: driverName
            ? `Matched with ${driverName}`
            : "Matched with driver",
          color: "text-success",
          bgColor: "bg-success/10",
          borderColor: "border-success/20",
        };
      case "en-route":
        return {
          icon: "Bike",
          text: driverName ? `${driverName} is coming` : "Driver is on the way",
          color: "text-primary",
          bgColor: "bg-primary/10",
          borderColor: "border-primary/20",
        };
      case "arrived":
        return {
          icon: "MapPin",
          text: driverName ? `${driverName} has arrived` : "Driver has arrived",
          color: "text-accent",
          bgColor: "bg-accent/10",
          borderColor: "border-accent/20",
        };
      case "in-progress":
        return {
          icon: "Navigation",
          text: "Trip in progress",
          color: "text-primary",
          bgColor: "bg-primary/10",
          borderColor: "border-primary/20",
        };
      case "completed":
        return {
          icon: "CheckCircle",
          text: "Ride completed",
          color: "text-success",
          bgColor: "bg-success/10",
          borderColor: "border-success/20",
        };
      default:
        return {
          icon: "Car",
          text: "Active ride",
          color: "text-primary",
          bgColor: "bg-primary/10",
          borderColor: "border-primary/20",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`fixed top-20 left-4 right-4 ${config.bgColor} ${config.borderColor} border rounded-lg p-3 shadow-soft z-50 md:left-auto md:right-4 md:w-80 backdrop-blur-md`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`${config.color} animate-pulse-gentle`}>
            <Icon name={config.icon} size={20} />
          </div>
          <div>
            <p className={`font-medium text-sm ${config.color}`}>
              {config.text}
            </p>
            {estimatedTime && (
              <p className="text-xs text-muted-foreground font-mono">
                ETA: {estimatedTime}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onViewDetails}
            className="p-1.5 hover:bg-muted rounded-md transition-colors"
            aria-label="View ride details"
          >
            <Icon name="Eye" size={16} className="text-muted-foreground" />
          </button>

          {(status === "en-route" || status === "in-progress") && (
            <button
              onClick={onEmergency}
              className="p-1.5 hover:bg-error/10 rounded-md transition-colors"
              aria-label="Emergency"
            >
              <Icon name="AlertTriangle" size={16} className="text-error" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RideStatusIndicator;
