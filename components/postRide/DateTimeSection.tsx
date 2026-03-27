"use client";

import React from "react";
import { CalendarDays, Clock3 } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

interface DateTimeSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: Record<string, string>;
  mode?: "offer" | "request";
}

const quickTimeOptions = [
  { label: "08:00", note: "Morning" },
  { label: "14:00", note: "Afternoon" },
  { label: "18:00", note: "Evening" },
  { label: "22:00", note: "Night" },
];

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DateTimeSection: React.FC<DateTimeSectionProps> = ({
  formData,
  updateFormData,
  errors,
  mode = "offer",
}) => {
  const getMinDate = () => new Date().toISOString().split("T")[0];

  const getMinTime = () => {
    const selectedDate = new Date(formData.schedule.date);
    const now = new Date();
    if (selectedDate.toDateString() !== now.toDateString()) return "00:00";
    return now.toTimeString().slice(0, 5);
  };

  const setScheduleField = (field: string, value: unknown) => {
    updateFormData({
      ...formData,
      schedule: {
        ...formData.schedule,
        [field]: value,
      },
    });
  };

  const setRecurringField = (field: string, value: unknown) => {
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

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Date and Time
          </h3>
          <Badge variant="outline">{mode === "offer" ? "Departure" : "Pickup request"}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={formData.schedule.date}
              onChange={(e) => setScheduleField("date", e.target.value)}
              min={getMinDate()}
            />
            {errors?.date ? <p className="text-xs text-destructive">{errors.date}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Time</Label>
            <Input
              type="time"
              value={formData.schedule.time}
              onChange={(e) => setScheduleField("time", e.target.value)}
              min={getMinTime()}
            />
            {errors?.time ? <p className="text-xs text-destructive">{errors.time}</p> : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Quick time picks</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickTimeOptions.map((option) => (
            <Button
              key={option.label}
              variant={formData.schedule.time === option.label ? "default" : "outline"}
              className="h-auto py-2 px-2"
              onClick={() => setScheduleField("time", option.label)}
            >
              <div className="flex flex-col leading-tight text-left">
                <span className="text-xs sm:text-sm">{option.label}</span>
                <span className="text-[11px] opacity-80">{option.note}</span>
              </div>
            </Button>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-border/70 bg-card p-4 md:p-5">
        <summary className="cursor-pointer list-none flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Advanced timing</span>
          <Badge variant="outline">Optional</Badge>
        </summary>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Flexibility (minutes)</Label>
            <Input
              type="number"
              value={formData.schedule.flexibility}
              onChange={(e) => setScheduleField("flexibility", Number(e.target.value) || 0)}
              min={0}
              max={60}
            />
          </div>

          <div className="space-y-2">
            <Label>Recurring days</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {weekdayLabels.map((day, index) => {
                const active = formData.schedule.recurring.days.includes(index);
                return (
                  <Button
                    key={day}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="px-0 text-xs"
                    onClick={() => {
                      const days = active
                        ? formData.schedule.recurring.days.filter((d: number) => d !== index)
                        : [...formData.schedule.recurring.days, index];
                      setRecurringField("days", days);
                    }}
                  >
                    {day}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recurring end date</Label>
            <Input
              type="date"
              value={formData.schedule.recurring.endDate}
              onChange={(e) => setRecurringField("endDate", e.target.value)}
              min={formData.schedule.date || getMinDate()}
            />
          </div>
        </div>
      </details>
    </div>
  );
};

export default DateTimeSection;
