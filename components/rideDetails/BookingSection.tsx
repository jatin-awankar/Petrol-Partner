'use client';

import React, { useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { CreditCard } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import Icon from '../AppIcon';
import { Button } from '../ui/button';

interface BookingSectionProps {
  ride?: any;
  role?: 'driver' | 'passenger';
  onBookRide: (bookingData: any) => void;
}

const BookingSection: React.FC<BookingSectionProps> = ({
  ride,
  role = 'passenger',
  onBookRide,
}) => {
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const isLoading = !ride;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton width={200} height={25} />
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={80} />
        <Skeleton height={40} />
        <Skeleton height={60} />
        <Skeleton height={50} />
      </div>
    );
  }

  const seatOptions = Array.from({ length: ride?.availableSeats || 1 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `${i + 1} seat${i + 1 > 1 ? 's' : ''}`,
  }));

  const paymentMethods =
    role === 'passenger'
      ? [
          { value: 'online', label: 'Online settlement after ride completion' },
          { value: 'upi', label: 'Direct UPI settlement after ride completion' },
          { value: 'cash', label: 'Cash settlement after ride completion' },
        ]
      : [{ value: 'cash', label: 'Offline settlement confirmation' }];

  const totalCost = (ride?.totalPrice ?? 0) * selectedSeats;
  const platformFee = (ride?.platformFee ?? 0) * selectedSeats;
  const finalAmount = totalCost + platformFee;

  const handleBooking = async () => {
    if (role === 'passenger' && !selectedPaymentMethod) return;

    setIsProcessing(true);

    const paymentMethodLabelMap: Record<string, string> = {
      online: "Online settlement",
      upi: "Direct UPI",
      cash: "Cash",
    };

    const bookingData = {
      rideId: ride?.id,
      role,
      seats: selectedSeats,
      specialRequests,
      paymentMethod: selectedPaymentMethod,
      paymentMethodLabel: paymentMethodLabelMap[selectedPaymentMethod] || "N/A",
      totalAmount: finalAmount,
      paymentStatus: "pending_owner_confirmation",
    };

    try {
      onBookRide(bookingData);
    } catch (error) {
      console.error('Booking error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {role === 'passenger' ? 'Book Your Ride' : 'Respond to Ride Request'}
      </h3>

      <div className="space-y-4">
        {role === 'passenger' && (
          <>
            <Label>Number of seats</Label>
            <Select
              value={selectedSeats.toString() || ''}
              onValueChange={(value) => setSelectedSeats(parseInt(value, 10))}
            >
              <SelectTrigger className="mb-4">
                <SelectValue placeholder="Select seats" />
              </SelectTrigger>
              <SelectContent>
                {seatOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <Label>Special requests (optional)</Label>
        <Input
          type="text"
          placeholder="Optional instructions for the driver/passenger"
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
        />

        <div className="bg-muted/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">Estimated Fare</h4>
          <div className="space-y-2">
            {role === 'passenger' && (
              <>
                <div className="flex items-center justify-between">
                  <span>{selectedSeats} seat{selectedSeats > 1 ? 's' : ''} × ₹{ride?.totalPrice}</span>
                  <span>₹{totalCost}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Platform fee</span>
                  <span>₹{platformFee}</span>
                </div>
                <hr className="border-border" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground">Estimated total</span>
              <span className="text-base font-semibold text-primary">₹{finalAmount}</span>
            </div>
          </div>
        </div>

        {role === 'passenger' && (
          <>
            <Label>Preferred settlement method</Label>
            <Select
              value={selectedPaymentMethod || ''}
              onValueChange={(value) => setSelectedPaymentMethod(value)}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select settlement method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="bg-warning/10 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <Icon name="Shield" size={16} className="text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning mb-1">Safety First</p>
              <p className="text-xs text-foreground">
                Share ride details with trusted contacts. Payment is settled only after ride completion.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={handleBooking}
          disabled={(role === 'passenger' && !selectedPaymentMethod) || isProcessing}
          className="w-full"
        >
          <CreditCard />
          {isProcessing
            ? 'Processing...'
            : role === 'passenger'
              ? `Send Booking Request for ₹${finalAmount}`
              : 'Respond to Request'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          By booking, you agree to our{" "}
          <span className="text-primary underline cursor-pointer">Terms of Service</span> and{" "}
          <span className="text-primary underline cursor-pointer">Cancellation Policy</span>.
        </p>
      </div>
    </div>
  );
};

export default BookingSection;
