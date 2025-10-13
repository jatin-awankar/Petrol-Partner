"use client";

import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import { Button } from "../ui/button";
import Icon from "../AppIcon";
import { Send } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: any; // You can replace 'any' with your FormData type
  onPublish: () => void;
}

// Error Boundary
class PreviewModalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("PreviewModal Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong while rendering the preview.
        </div>
      );
    }
    return this.props.children;
  }
}

const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  formData,
  onPublish,
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const timer = setTimeout(() => setLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (date: string) =>
    new Date(date)?.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatTime = (time: string) =>
    new Date(`2000-01-01T${time}`)?.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-pulse">
        <div className="bg-card rounded-lg border border-border max-w-2xl w-full h-[80vh] p-6 space-y-4">
          <Skeleton height={30} width="40%" className="mb-4" />
          <Skeleton count={6} height={60} className="mb-3"/>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center z-50 justify-center p-4">
      <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[75vh] overflow-y-auto transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Ride Preview
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Icon name="X" size={20} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Route Information */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center">
              <Icon name="MapPin" size={18} className="mr-2 text-primary" />
              Route Details
            </h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-success rounded-full"></div>
                <span className="text-sm text-foreground">{formData?.route?.pickup}</span>
              </div>
              {formData?.route?.via && (
                <div className="flex items-center space-x-3 ml-1.5">
                  <div className="w-1 h-8 bg-border"></div>
                  <span className="text-sm text-muted-foreground">Via: {formData?.route?.via}</span>
                </div>
              )}
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-error rounded-full"></div>
                <span className="text-sm text-foreground">{formData?.route?.dropoff}</span>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center">
                <Icon name="Calendar" size={18} className="mr-2 text-primary" />
                Date & Time
              </h3>
              <p className="text-sm text-foreground">{formatDate(formData?.schedule?.date)}</p>
              <p className="text-sm text-foreground">{formatTime(formData?.schedule?.time)}</p>
              {formData?.schedule?.flexibility > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ±{formData?.schedule?.flexibility} minutes flexible
                </p>
              )}
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center">
                <Icon name="Users" size={18} className="mr-2 text-primary" />
                Available Seats
              </h3>
              <p className="text-2xl font-bold text-primary">{formData?.availableSeats}</p>
              <p className="text-xs text-muted-foreground">passengers</p>
            </div>
          </div>

          {/* Vehicle & Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center">
                <Icon name="Car" size={18} className="mr-2 text-primary" />
                Vehicle
              </h3>
              {formData?.vehicle?.selectedId ? (
                <div>
                  <p className="text-sm text-foreground">Honda City 2022</p>
                  <p className="text-xs text-muted-foreground">White • Petrol • DL 01 AB 1234</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground">
                    {formData?.vehicle?.make} {formData?.vehicle?.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formData?.vehicle?.color} • {formData?.vehicle?.fuel}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center">
                <Icon name="IndianRupee" size={18} className="mr-2 text-primary" />
                Pricing
              </h3>
              <p className="text-2xl font-bold text-success">₹{formData?.pricing?.farePerSeat}</p>
              <p className="text-xs text-muted-foreground">per seat</p>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center">
              <Icon name="Settings" size={18} className="mr-2 text-primary" />
              Preferences & Rules
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Gender:</span>
                <span className="ml-2 text-foreground capitalize">{formData?.preferences?.gender}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Conversation:</span>
                <span className="ml-2 text-foreground capitalize">{formData?.preferences?.conversation}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Music:</span>
                <span className="ml-2 text-foreground capitalize">{formData?.preferences?.music}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Age Range:</span>
                <span className="ml-2 text-foreground">
                  {formData?.preferences?.ageRange?.[0]}-{formData?.preferences?.ageRange?.[1]}
                </span>
              </div>
            </div>
            
            {formData?.preferences?.rules?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">Rules:</p>
                <div className="flex flex-wrap gap-2">
                  {formData?.preferences?.rules?.map((rule: string | number | null | undefined) => (
                    <span key={rule} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      {typeof rule === 'string' ? rule.replace(/_/g, ' ') : rule}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment Methods */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-2 flex items-center">
              <Icon name="CreditCard" size={18} className="mr-2 text-primary" />
              Payment Methods
            </h3>
            <div className="flex flex-wrap gap-2">
              {formData?.pricing?.paymentMethods?.map((method: string, index: number) => (
                <span key={index} className="px-3 py-1 bg-success/10 text-success text-sm rounded-full capitalize">
                  {method}
                </span>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          {formData?.preferences?.notes && (
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center">
                <Icon name="MessageSquare" size={18} className="mr-2 text-primary" />
                Additional Notes
              </h3>
              <p className="text-sm text-muted-foreground">{formData?.preferences?.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Edit Details
          </Button>
          <Button variant="default" onClick={onPublish}>
            Publish Ride
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Export with error boundary
export default function PreviewModalWithErrorBoundary(
  props: PreviewModalProps
) {
  return (
    <PreviewModalErrorBoundary>
      <PreviewModal {...props} />
    </PreviewModalErrorBoundary>
  );
}
