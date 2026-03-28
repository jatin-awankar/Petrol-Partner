"use client";

import React from "react";
import Icon from "../AppIcon";

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
  const progress = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Completion</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isDone = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                isActive
                  ? "border-primary/30 bg-primary/12 shadow-[0_8px_24px_-20px_hsl(var(--primary))]"
                  : isDone
                    ? "border-success/30 bg-success/10"
                    : "border-border/70 bg-background/75"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Icon name="Check" size={14} /> : stepNumber}
              </span>
              <p
                className={`text-sm font-medium ${
                  isActive || isDone ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.title}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProgressIndicator;
