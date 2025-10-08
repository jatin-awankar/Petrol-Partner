"use client";

import React, { useState, useEffect } from "react";
import Icon from "@/components/AppIcon";
import Skeleton from "react-loading-skeleton";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Label } from "../ui/label";

// Error Boundary
class DateTimeSectionErrorBoundary extends React.Component<
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
    console.error("DateTimeSection Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-100 text-red-800 p-4 rounded-xl">
          Something went wrong loading the Date & Time section.
        </div>
      );
    }
    return this.props.children;
  }
}

// Props interface
interface DateTimeSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
}

const DateTimeSection: React.FC<DateTimeSectionProps> = ({
  formData,
  updateFormData,
  errors,
}) => {
  const [showRecurring, setShowRecurring] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDateTimeChange = (field: string, value: any) => {
    updateFormData({
      ...formData,
      schedule: {
        ...formData.schedule,
        [field]: value,
      },
    });
  };

  const handleRecurringChange = (field: string, value: any) => {
    updateFormData({
      ...formData,
      schedule: {
        ...formData.schedule,
        recurring: {
          ...formData.schedule.recurring,
          [field]: value,
        },
      },
    });
  };

  const getMinDate = () => new Date().toISOString().split("T")[0];

  const getMinTime = () => {
    const now = new Date();
    const selectedDate = new Date(formData.schedule.date);
    const today = new Date();

    if (selectedDate.toDateString() === today.toDateString()) {
      return now.toTimeString().slice(0, 5);
    }
    return "00:00";
  };

  const quickTimeOptions = [
    { label: "Morning (8:00 AM)", value: "08:00" },
    { label: "Afternoon (2:00 PM)", value: "14:00" },
    { label: "Evening (6:00 PM)", value: "18:00" },
    { label: "Night (10:00 PM)", value: "22:00" },
  ];

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 space-y-4 animate-pulse">
        <Skeleton height={30} width={`50%`} className="mb-2" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={40} width="100%" />
        <Skeleton height={120} width="100%" className="rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="Calendar" size={20} className="mr-2 text-primary" />
        Date & Time
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Label>Departure Date</Label>
          <Input
            type="date"
            value={formData.schedule.date}
            onChange={(e) => handleDateTimeChange("date", e.target.value)}
            // @ts-expect-error: 'error' prop is custom for our Input component
            error={errors?.date}
            min={getMinDate()}
            required
          />

          <Label>Departure Time</Label>
          <Input
            type="time"
            value={formData.schedule.time}
            onChange={(e) => handleDateTimeChange("time", e.target.value)}
            // @ts-expect-error: 'label' prop is custom for our Input component
            error={errors?.time}
            min={getMinTime()}
            required
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Quick Time Selection
            </label>
            <div className="grid grid-cols-2 gap-2">
              {quickTimeOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    formData.schedule.time === option.value
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => handleDateTimeChange("time", option.value)}
                  className="text-xs"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            // @ts-expect-error: 'label' prop is custom for our Input component
            label="Flexible Timing (minutes)"
            type="number"
            placeholder="0"
            value={formData.schedule.flexibility}
            onChange={(e) =>
              handleDateTimeChange("flexibility", e.target.value)
            }
            description="How many minutes early/late you can accommodate"
            min={0}
            max={60}
          />

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">
                Recurring Ride
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRecurring(!showRecurring)}
              >
                {showRecurring ? "Hide" : "Setup"}
                {showRecurring ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>

            {showRecurring && (
              <div className="space-y-3">
                <div className="grid grid-cols-7 gap-1">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (day, index) => (
                      <Button
                        key={day}
                        variant={
                          formData.schedule.recurring.days.includes(index)
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          const days =
                            formData.schedule.recurring.days.includes(index)
                              ? formData.schedule.recurring.days.filter(
                                  (d: number) => d !== index
                                )
                              : [...formData.schedule.recurring.days, index];
                          handleRecurringChange("days", days);
                        }}
                        className="text-xs p-1"
                      >
                        {day}
                      </Button>
                    )
                  )}
                </div>

                <Label>End Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.schedule.recurring.endDate}
                  onChange={(e) =>
                    handleRecurringChange("endDate", e.target.value)
                  }
                  min={formData.schedule.date}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Export wrapped with error boundary
export default function DateTimeSectionWithErrorBoundary(
  props: DateTimeSectionProps
) {
  return (
    <DateTimeSectionErrorBoundary>
      <DateTimeSection {...props} />
    </DateTimeSectionErrorBoundary>
  );
}
