'use client';

import React, { useState } from 'react';
import Skeleton from 'react-loading-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import Icon from '../AppIcon';
import { Button } from '../ui/button';
import { CreditCard } from 'lucide-react';

interface BookingSectionProps {
  ride?: any;
  role?: 'driver' | 'passenger';
  onBookRide: (bookingData: any) => void;
}

const BookingSection: React.FC<BookingSectionProps> = ({ ride, role = 'passenger', onBookRide }) => {
  const [selectedSeats, setSelectedSeats] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');

  const isLoading = !ride;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton width={200} height={25} /> {/* Title */}
        <Skeleton height={40} /> {/* Seat selector */}
        <Skeleton height={40} /> {/* Special requests input */}
        <Skeleton height={80} /> {/* Cost breakdown */}
        <Skeleton height={40} /> {/* Payment method */}
        <Skeleton height={60} /> {/* Button */}
        <Skeleton height={50} /> {/* Safety notice */}
      </div>
    );
  }

  const seatOptions = Array.from({ length: ride?.availableSeats }, (_, i) => ({
    value: (i + 1).toString(),
    label: `${i + 1} seat${i + 1 > 1 ? 's' : ''}`
  }));

  const paymentMethods =
    role === 'passenger'
      ? [
          { value: 'upi_primary', label: 'UPI - rajesh.kumar@paytm (Primary)' },
          { value: 'upi_secondary', label: 'UPI - rajesh@gpay' },
          { value: 'card_1', label: 'Card ending in 4532' },
          { value: 'wallet', label: 'Petrol Partner Wallet (₹450)' }
        ]
      : [{ value: 'wallet', label: 'Petrol Partner Wallet (₹450)' }];

  const totalCost = ride?.totalPrice * selectedSeats;
  const platformFee = ride?.platformFee * selectedSeats;
  const finalAmount = totalCost + platformFee;

  const handleBooking = () => {
    if (!selectedPaymentMethod && role === 'passenger') return;
    const bookingData = {
      rideId: ride?.id,
      role,
      seats: selectedSeats,
      specialRequests,
      paymentMethod: selectedPaymentMethod,
      totalAmount: finalAmount
    };
    onBookRide(bookingData);
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
              onValueChange={(value) => setSelectedSeats(parseInt(value))}
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

        <Label>
          Special requests (optional)
        </Label>
        <Input
          type="text"
          placeholder="Optional instructions for the driver/passenger"
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
        />

        {/* Cost */}
        <div className="bg-muted/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-foreground mb-3">Cost Breakdown</h4>
          <div className="space-y-2">
            {role === 'passenger' && (
              <>
                <div className="flex items-center justify-between">
                  <span>{selectedSeats} seat{selectedSeats > 1 ? 's' : ''} × ₹{ride?.totalPrice}</span>
                  <span>₹{totalCost}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Platform fee</span>
                  <span className="text-sm text-muted-foreground">₹{platformFee}</span>
                </div>
                <hr className="border-border" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-base font-semibold text-primary">₹{finalAmount}</span>
            </div>
          </div>
        </div>

        {role === 'passenger' && (
          <>
            <Label>Payment method</Label>
            <Select
              value={selectedPaymentMethod || ''}
              onValueChange={(value) => setSelectedPaymentMethod(value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
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

        {/* Safety Notice */}
        <div className="bg-warning/10 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <Icon name="Shield" size={16} className="text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning mb-1">Safety First</p>
              <p className="text-xs text-foreground">
                Share ride details with trusted contacts. Emergency button available during the trip.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={handleBooking}
          disabled={role === 'passenger' && !selectedPaymentMethod}
          className="w-full"
        >
          <CreditCard />
          {role === 'passenger' ? `Book Ride for ₹${finalAmount}` : 'Respond to Request'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          By booking, you agree to our{' '}
          <span className="text-primary underline cursor-pointer">Terms of Service</span> and{' '}
          <span className="text-primary underline cursor-pointer">Cancellation Policy</span>
        </p>
      </div>
    </div>
  );
};

export default BookingSection;
