import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Clock, Users, Star } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { redirect } from "next/navigation";

export function BookOfferDialog({
  open,
  onOpenChange,
  ride,
  onBook,
}: BookOfferDialogProps) {
  const [seatsToBook, setSeatsToBook] = useState(1);
  const [loading, setLoading] = useState(false);

  // Return early if ride is not provided
  if (!ride) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    await onBook(ride.id, seatsToBook);

    setLoading(false);
  };

  const totalCost = ride?.price_per_seat
    ? ride.price_per_seat * seatsToBook
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book Ride</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ride Details */}
          <div className="bg-accent/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center space-x-3">
              <Avatar className="bg-gradient-primary card-profile cursor-pointer">
                <AvatarImage
                  src={ride.driver?.avatar_url}
                  onClick={() => redirect(`/profile/${ride.driver?.id}`)}
                />
                <AvatarFallback className="bg-gradient-primary text-white text-2xl">
                  {ride.driver?.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">{ride.driver?.full_name}</h3>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span>{ride.driver?.avg_rating || 0}</span>
                  <span>•</span>
                  <span>{ride.driver?.college || "College"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{ride.from_location}</span>
                <span className="text-muted-foreground">→</span>
                <span>{ride.to_location}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    {format(new Date(ride.departure_time), "MMM d, h:mm a")}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{ride.available_seats} available</span>
                </div>
              </div>

              {ride.description && (
                <p className="text-sm text-muted-foreground">
                  {ride.description}
                </p>
              )}
            </div>
          </div>

          {/* Booking Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seats">Number of Seats</Label>
              <Input
                id="seats"
                type="number"
                min="1"
                max={ride.available_seats}
                value={seatsToBook}
                onChange={(e) => setSeatsToBook(parseInt(e.target.value))}
                required
              />
            </div>

            {/* Cost Summary */}
            <div className="bg-primary/5 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Price per seat:</span>
                <span>₹{ride.price_per_seat}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Seats:</span>
                <span>{seatsToBook}</span>
              </div>
              <div className="h-px bg-border"></div>
              <div className="flex justify-between font-semibold">
                <span>Total Cost:</span>
                <span className="text-primary">${totalCost.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Booking..." : `Book for $${totalCost.toFixed(2)}`}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
