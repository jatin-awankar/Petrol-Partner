"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPinned, Shield, UserRoundCheck, X } from "lucide-react";

import { Button } from "../ui/button";

const SafetyReminders: React.FC = () => {
  const [dismissed, setDismissed] = useState<string[]>([]);

  const reminders = useMemo(
    () => [
      {
        id: "identity",
        title: "Complete verification profile",
        message: "Student and vehicle checks improve trust for bookings.",
        icon: UserRoundCheck,
        ctaLabel: "Review profile",
        ctaHref: "/profile-settings",
      },
      {
        id: "pickup-point",
        title: "Use clear pickup landmarks",
        message: "Avoid confusion by using gates, bus stops, or known points.",
        icon: MapPinned,
        ctaLabel: "Post ride",
        ctaHref: "/post-a-ride",
      },
      {
        id: "trip-sharing",
        title: "Share trip updates with a trusted contact",
        message: "Share booking details before departure for safer travel.",
        icon: Shield,
        ctaLabel: "Open settings",
        ctaHref: "/profile-settings",
      },
    ],
    [],
  );

  const visibleReminders = reminders.filter((item) => !dismissed.includes(item.id));

  if (visibleReminders.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-100 p-1.5 text-amber-700">
            <AlertTriangle className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">Safety checklist</h2>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        {visibleReminders.map((reminder) => (
          <article
            key={reminder.id}
            className="rounded-xl border border-border/70 bg-background p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <reminder.icon className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{reminder.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {reminder.message}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setDismissed((prev) => [...prev, reminder.id])}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-3">
              <Button asChild size="sm" variant="outline" className="h-8 rounded-md">
                <Link href={reminder.ctaHref}>{reminder.ctaLabel}</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default SafetyReminders;
