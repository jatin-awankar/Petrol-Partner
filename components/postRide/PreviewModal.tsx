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
      const timer = setTimeout(() => setLoading(false), 200);
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
          <Skeleton height={30} width="40%" />
          <Skeleton count={10} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto transition-all duration-200">
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
          {/* Reuse your existing route, schedule, vehicle, seats, pricing, preferences & notes sections */}
          {/* ...same as your existing JSX */}
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
