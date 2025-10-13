import { motion } from "framer-motion";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

export type RideType = "offer" | "request";

export type Person = {
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
  college?: string;
  age?: number;
  avatar?: string;
};

export type Ride = {
  id: string;
  type: RideType;
  pickup?: string;
  dropoff?: string;
  time: string;
  date?: string;
  price?: string;
  seatsAvailable?: number;
  vehicle?: { make?: string; model?: string; plate?: string; image?: string };
  driver?: Person;
  passenger?: Person;
  coords?: { lat: number; lng: number };
  distanceKm?: number;
  duration?: string;
};

const RideCard: React.FC<{ ride: Ride; onClick?: (ride: Ride) => void }> = ({
  ride,
  onClick,
}) => {
  const person = ride.type === "offer" ? ride.driver : ride.passenger;

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
        <div className="flex items-start justify-between gap-3">
          {/* Avatar + Ride Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                <span className="text-sm font-medium text-foreground">
                  {person?.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground truncate">
                    {ride.pickup ?? "Unknown"} → {ride.dropoff ?? "Unknown"}
                  </h4>
                  {ride.date && (
                    <span className="text-xs text-muted-foreground">{ride.date}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {person?.name} • {person?.college ?? ""}
                </p>
                {ride.distanceKm && (
                  <p className="text-xs text-muted-foreground">
                    {ride.distanceKm.toFixed(1)} km away
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Price + Seats + Button */}
          <div className="flex flex-col items-end justify-between">
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">{ride.price ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{ride.time}</div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              {ride.seatsAvailable !== undefined && (
                <div className="px-2 py-1 bg-muted rounded-md text-xs text-foreground">
                  {ride.seatsAvailable} seat{ride.seatsAvailable > 1 ? "s" : ""}
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => onClick?.(ride)}>
                View
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default RideCard;
