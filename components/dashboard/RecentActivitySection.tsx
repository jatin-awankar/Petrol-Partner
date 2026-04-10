"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  CircleX,
  Clock3,
  MessageCircle,
  Route,
} from "lucide-react";
import { toast } from "sonner";

import { useFetchBookings } from "@/hooks/bookings/useFetchBookings";
import { useCancelBooking } from "@/hooks/bookings/useCancelBooking";
import { frontendConfig } from "@/lib/frontend-config";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import { Button } from "../ui/button";
import { SkeletonBlock } from "./DashboardSkeletons";

function statusUi(status: string) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        icon: CheckCircle2,
        className: "bg-emerald-100 text-emerald-700",
      };
    case "completed":
      return {
        label: "Completed",
        icon: CheckCircle2,
        className: "bg-blue-100 text-blue-700",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        icon: CircleX,
        className: "bg-red-100 text-red-700",
      };
    default:
      return {
        label: "Pending",
        icon: Clock3,
        className: "bg-amber-100 text-amber-700",
      };
  }
}

const RecentActivitySection: React.FC = () => {
  const router = useRouter();
  const { bookingsData, loading, refetch } = useFetchBookings(6);
  const { cancelBooking, loading: updating } = useCancelBooking();

  const activities = bookingsData?.bookings ?? [];

  const handleUpdateStatus = async (
    bookingId: string,
    nextStatus: "confirmed" | "cancelled" | "completed",
    successMessage: string,
  ) => {
    try {
      await cancelBooking(bookingId, nextStatus);
      toast.success(successMessage);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || "Unable to update booking");
    }
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Route className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">
            Recent bookings
          </h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 rounded-md">
          <Link href="/profile-settings">View all</Link>
        </Button>
      </header>

      <div className="mt-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-20 rounded-xl border border-border/70" />
          ))
        ) : activities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-medium text-foreground">
              No bookings yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Book a ride or post one to see activity updates here.
            </p>
          </div>
        ) : (
          activities.map((booking) => {
            const ui = statusUi(booking.status || "pending");
            const StatusIcon = ui.icon;
            const isDriver = booking.user_role === "driver";
            const isOfferFlow = Boolean((booking as any).ride_offer_id);
            const isRequestFlow = Boolean((booking as any).ride_request_id);
            const canRespondToPending =
              booking.status === "pending" &&
              ((isOfferFlow && isDriver) ||
                (isRequestFlow && booking.user_role === "passenger"));
            const canMarkCompleted = booking.status === "confirmed" && isDriver;
            const canOpenChat =
              frontendConfig.flags.enableChatUi &&
              ["confirmed", "completed", "cancelled", "expired"].includes(booking.status);

            return (
              <article
                key={booking.booking_id}
                className="rounded-xl border border-border/70 bg-background p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {booking.pickup_location} ? {booking.drop_location}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ui.className}`}
                      >
                        <StatusIcon className="size-3.5" />
                        {ui.label}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" />
                        {formatUtcToTodayOrDayMonth(booking.date)}
                      </span>
                      <span>{formatTimeToAmPm(booking.time)}</span>
                      <span>with {booking.other_user_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canRespondToPending ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updating}
                          className="h-8 rounded-md"
                          onClick={() =>
                            handleUpdateStatus(
                              booking.booking_id,
                              "cancelled",
                              "Booking declined",
                            )
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={updating}
                          className="h-8 rounded-md"
                          onClick={() =>
                            handleUpdateStatus(
                              booking.booking_id,
                              "confirmed",
                              "Booking accepted",
                            )
                          }
                        >
                          Accept
                        </Button>
                      </>
                    ) : canOpenChat || canMarkCompleted ? (
                      <>
                        {canOpenChat ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md"
                            onClick={() =>
                              router.push(`/messages-chat?bookingId=${booking.booking_id}`)
                            }
                          >
                            <MessageCircle className="mr-1 size-3.5" />
                            Chat
                          </Button>
                        ) : null}
                        {canMarkCompleted ? (
                          <Button
                            size="sm"
                            disabled={updating}
                            className="h-8 rounded-md"
                            onClick={() =>
                              handleUpdateStatus(
                                booking.booking_id,
                                "completed",
                                "Ride marked as completed",
                              )
                            }
                          >
                            Mark Completed
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};

export default RecentActivitySection;

