import { motion } from "framer-motion";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { formatTimeToAmPm, formatUtcToTodayOrDayMonth } from "@/lib/utils";
import Image from "next/image";
import Skeleton from "react-loading-skeleton";

const RideCard: React.FC<{
  ride: CombineRideData;
  onClick?: (ride: CombineRideData) => void;
  loading: boolean;
}> = ({ ride, onClick, loading }) => {

  const formattedDate = formatUtcToTodayOrDayMonth(ride.date);
  const formattedTime = formatTimeToAmPm(ride.time);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
    >
      <Card
        className="p-4 hover:shadow-medium transition-shadow cursor-pointer"
        onClick={() => onClick?.(ride)}
      >
        {loading ? (
          <div className="border border-border rounded-lg gap-3 animate-pulse">
            <Skeleton width="100%" height={16} className="mb-2" />
            <Skeleton width="80%" height={12} className="mb-2" />
            <Skeleton width="90%" height={12} />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            {/* Avatar + Ride Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {ride.profile_image ? (
                    <Image
                      src={ride.profile_image}
                      alt={ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                      width={40}
                      height={40}
                      className="w-full"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      {ride?.full_name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center">
                    <h4 className="text-sm font-semibold text-foreground">
                      {ride.pickup_location ?? "Unknown"} →{" "}
                      {ride.drop_location ?? "Unknown"}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    {ride?.full_name} • {ride?.college ?? ""}
                  </p>
                  {ride.date && (
                    <span className="text-xs text-muted-foreground">
                      {formattedDate}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Price + Seats + Button */}
            <div className="flex flex-col items-end justify-between">
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">
                  ₹{ride.price_per_seat ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formattedTime}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {(ride.available_seats || ride.seats_required) !==
                  undefined && (
                  <div className="px-2 py-1 bg-muted rounded-md text-xs text-foreground">
                    {ride.available_seats !== undefined &&
                    ride.available_seats !== null
                      ? `${ride.available_seats} seat${
                          ride.available_seats > 1 ? "s" : ""
                        }`
                      : ride.seats_required !== undefined &&
                        ride.seats_required !== null
                      ? `${ride.seats_required} seat${
                          ride.seats_required > 1 ? "s" : ""
                        }`
                      : ""}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClick?.(ride)}
                >
                  View
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
};

export default RideCard;
