import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CalendarIcon, DollarSign, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseClient } from '@/lib/supabase/client';

interface RespondToRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RideRequest;
  onSuccess?: () => void;
}

export const BookRequestDialog = ({ 
  open, 
  onOpenChange, 
  request, 
  onSuccess
}: RespondToRequestDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    departure_time: '',
    available_seats: 1,
    offered_price_per_seat: request.price_per_seat,
    message: ''
  });

  // Return early if ride is not provided
  if (!request) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await supabaseClient
        .from('ride_request_responses')
        .insert([
          {
            ride_request_id: request.id,
            driver_id: request.ride?.driver_id,
            departure_time: formData.departure_time,
            available_seats: formData.available_seats,
            offered_price_per_seat: formData.offered_price_per_seat,
            message: formData.message || null
          }
        ]);

      if (error) throw error;

      toast.success("Response sent successfully!", {description: "The passenger will be notified of your response."});

      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        departure_time: '',
        available_seats: 1,
        offered_price_per_seat: request.price_per_seat,
        message: ''
      });
    } catch (error: any) {
      toast.error("Failed to send response",{
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Respond to Ride Request</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Request Summary */}
          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="flex items-center space-x-2 text-sm">
              <span className="font-medium">{request.from_location} → {request.to_location}</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <Users className="w-3 h-3" />
                <span>{request.requested_seats} passenger{request.requested_seats > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center space-x-1">
                <DollarSign className="w-3 h-3" />
                <span>Max ${request.price_per_seat}/seat</span>
              </div>
            </div>
          </div>

          {/* Departure Time */}
          <div className="space-y-2">
            <Label htmlFor="departure_time" className="flex items-center space-x-2">
              <CalendarIcon className="w-4 h-4" />
              <span>Your Departure Time</span>
            </Label>
            <Input
              id="departure_time"
              type="datetime-local"
              value={formData.departure_time}
              onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
              required
            />
          </div>

          {/* Available Seats */}
          <div className="space-y-2">
            <Label htmlFor="available_seats" className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Available Seats</span>
            </Label>
            <Input
              id="available_seats"
              type="number"
              min="1"
              max="8"
              value={formData.available_seats}
              onChange={(e) => setFormData({ ...formData, available_seats: parseInt(e.target.value) || 1 })}
              required
            />
          </div>

          {/* Price per Seat */}
          <div className="space-y-2">
            <Label htmlFor="offered_price_per_seat" className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span>Price per Seat</span>
            </Label>
            <Input
              id="offered_price_per_seat"
              type="number"
              step="0.01"
              min="0"
              max={request.price_per_seat}
              value={formData.offered_price_per_seat}
              onChange={(e) => setFormData({ ...formData, offered_price_per_seat: parseFloat(e.target.value) || 0 })}
              required
            />
            <p className="text-xs text-muted-foreground">
              Maximum: ${request.price_per_seat}
            </p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Add any additional details..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? "Sending..." : "Send Response"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};