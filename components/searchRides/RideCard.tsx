import { motion } from "framer-motion";
import Image from "next/image";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

const RideCard: React.FC<{
  ride: CombineRideData;
  onClick?: (ride: CombineRideData) => void;
}> = ({ ride, onClick }) => {
  const formattedDate = formatUtcToTodayOrDayMonth(ride.date);
  const formattedTime = formatTimeToAmPm(ride.time);
  const isOffer = Boolean(ride.driver_id);
  const seats = ride.available_seats ?? ride.seats_required ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
    >
      <Card
        className="group cursor-pointer border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 transition-all duration-200 hover:border-primary/35 hover:shadow-card md:p-5"
        onClick={() => onClick?.(ride)}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 to-muted">
                {ride.profile_image ? (
                  <Image
                    src={ride.profile_image}
                    alt={ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-sm font-medium text-foreground">
                      {ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {ride?.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {ride?.college || "College not specified"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-medium">
                {isOffer ? "Offer" : "Request"}
              </Badge>
              {ride.is_verified ? (
                <Badge className="border-success/30 bg-success/15 text-[11px] font-medium text-success">
                  Verified
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-muted/25 to-card p-3">
            <div className="flex items-start gap-2">
              <Icon name="CircleDot" size={14} className="mt-0.5 shrink-0 text-primary" />
              <p className="truncate text-sm text-foreground">
                {ride.pickup_location || "Pickup not set"}
              </p>
            </div>
            <div className="my-2 ml-1 h-4 border-l-4 border-dotted border-border" />
            <div className="flex items-start gap-2">
              <Icon
                name="MapPin"
                size={14}
                className="mt-0.5 shrink-0 text-foreground/75"
              />
              <p className="truncate text-sm text-foreground">
                {ride.drop_location || "Drop not set"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/60 bg-secondary/70 px-2 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</p>
              <p className="text-xs font-medium text-foreground">{formattedDate}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/70 px-2 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Time</p>
              <p className="text-xs font-medium text-foreground">{formattedTime}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-secondary/70 px-2 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Seats</p>
              <p className="text-xs font-medium text-foreground">{seats > 0 ? seats : "-"}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Price Per Seat</p>
              <div className="text-base font-semibold text-foreground">{"\u20B9"} {ride.price_per_seat ?? 0}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="group-hover:border-primary/40"
              onClick={() => onClick?.(ride)}
            >
              View details
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default RideCard;
