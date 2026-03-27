import { motion } from "framer-motion";
import Image from "next/image";
import Skeleton from "react-loading-skeleton";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import Icon from "../AppIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

const RideCard: React.FC<{
  ride: CombineRideData;
  onClick?: (ride: CombineRideData) => void;
  loading: boolean;
}> = ({ ride, onClick, loading }) => {
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
        className="group p-4 md:p-5 border-border/70 hover:border-primary/35 hover:shadow-card transition-all duration-200 cursor-pointer"
        onClick={() => onClick?.(ride)}
      >
        {loading ? (
          <div className="border border-border rounded-xl gap-3 animate-pulse p-4">
            <Skeleton width="100%" height={16} className="mb-2" />
            <Skeleton width="80%" height={12} className="mb-2" />
            <Skeleton width="90%" height={12} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {ride.profile_image ? (
                    <Image
                      src={ride.profile_image}
                      alt={ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      {ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {ride?.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ride?.college || "College not specified"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px] font-medium">
                  {isOffer ? "Offer" : "Request"}
                </Badge>
                {ride.is_verified && (
                  <Badge className="text-[11px] font-medium bg-success/15 text-success border-success/30">
                    Verified
                  </Badge>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <Icon
                  name="CircleDot"
                  size={14}
                  className="mt-0.5 text-primary shrink-0"
                />
                <p className="text-sm text-foreground truncate">
                  {ride.pickup_location || "Pickup not set"}
                </p>
              </div>
              <div className="my-2 ml-1 h-4 border-l-4 border-dotted border-border" />
              <div className="flex items-start gap-2">
                <Icon
                  name="MapPin"
                  size={14}
                  className="mt-0.5 text-foreground/75 shrink-0"
                />
                <p className="text-sm text-foreground truncate">
                  {ride.drop_location || "Drop not set"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-secondary/80 px-2 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Date
                </p>
                <p className="text-xs font-medium text-foreground">
                  {formattedDate}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/80 px-2 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Time
                </p>
                <p className="text-xs font-medium text-foreground">
                  {formattedTime}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/80 px-2 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Seats
                </p>
                <p className="text-xs font-medium text-foreground">
                  {seats > 0 ? seats : "-"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Price Per Seat
                </p>
                <div className="text-base font-semibold text-foreground">
                  Rs {ride.price_per_seat ?? 0}
                </div>
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
        )}
      </Card>
    </motion.div>
  );
};

export default RideCard;
