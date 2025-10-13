"use client";

import React, { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import Icon from "../AppIcon";

// Error Boundary
class ProgressIndicatorErrorBoundary extends React.Component<
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
    console.error("ProgressIndicator Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong loading the progress indicator.
        </div>
      );
    }
    return this.props.children;
  }
}

// Props interface
interface Step {
  id: string | number;
  title: string;
}

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: Step[];
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
  steps,
}) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="bg-card border-b border-border p-4 space-y-2 animate-pulse">
        <Skeleton height={24} width="30%" />
        <div className="flex space-x-2">
          {Array.from({ length: steps.length }).map((_, i) => (
            <Skeleton key={i} height={32} width={32} circle />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border-b border-border p-4 shadow-soft">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-foreground">Post a Ride</h2>
        <span className="text-sm text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </span>
      </div>

      <div className="flex items-center space-x-2">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  index + 1 < currentStep
                    ? "bg-success text-success-foreground"
                    : index + 1 === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1 < currentStep ? (
                  <Icon name="Check" size={16} />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`ml-2 text-xs font-medium hidden sm:block ${
                  index + 1 <= currentStep
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  index + 1 < currentStep ? "bg-success" : "bg-muted"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// Export wrapped with error boundary
export default function ProgressIndicatorWithErrorBoundary(
  props: ProgressIndicatorProps
) {
  return (
    <ProgressIndicatorErrorBoundary>
      <ProgressIndicator {...props} />
    </ProgressIndicatorErrorBoundary>
  );
}
