import React, { useState, useEffect, FC } from 'react';
import Icon from '../AppIcon';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface PricingSectionProps {
  formData: any;
  updateFormData: (data: any) => void;
  errors: any;
}

const PricingSection: FC<PricingSectionProps> = ({ formData, updateFormData, errors }) => {
  const [useCalculated, setUseCalculated] = useState(true);
  const [calculatedFare, setCalculatedFare] = useState(0);

  // Mock calculation based on distance and fuel costs
  useEffect(() => {
    const distance = 25; // Mock distance in km
    const fuelPrice = 102; // Mock fuel price per liter
    const mileage = 15; // Mock vehicle mileage
    const fuelCost = (distance / mileage) * fuelPrice;
    const tollsAndParking = 50; // Mock additional costs
    const calculated = Math.ceil((fuelCost + tollsAndParking) / (formData?.availableSeats || 1));
    setCalculatedFare(calculated);

    if (useCalculated) {
      handlePricingChange('farePerSeat', calculated);
    }
  }, [formData?.availableSeats, useCalculated]);

  const handlePricingChange = (field, value) => {
    updateFormData({
      ...formData,
      pricing: {
        ...formData?.pricing,
        [field]: value
      }
    });
  };

  const handlePaymentMethodToggle = (method) => {
    const methods = formData?.pricing?.paymentMethods?.includes(method)
      ? formData?.pricing?.paymentMethods?.filter(m => m !== method)
      : [...formData?.pricing?.paymentMethods, method];

    handlePricingChange('paymentMethods', methods);
  };

  const paymentMethods = [
    { id: 'upi', label: 'UPI', icon: 'Smartphone' },
    { id: 'cash', label: 'Cash', icon: 'Banknote' },
    { id: 'card', label: 'Card', icon: 'CreditCard' },
    { id: 'wallet', label: 'Digital Wallet', icon: 'Wallet' }
  ];

  const totalEarnings = (formData?.pricing?.farePerSeat || 0) * (formData?.availableSeats || 1);

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      <h3 className="text-lg font-semibold text-foreground flex items-center mb-4">
        <Icon name="IndianRupee" size={20} className="mr-2 text-primary" />
        Pricing & Payment
      </h3>

      {/* Fare Calculation */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-medium text-foreground">Fare Calculation</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated Distance:</span>
              <span className="font-medium text-foreground">25 km</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fuel Cost:</span>
              <span className="font-medium text-foreground">₹170</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tolls & Parking:</span>
              <span className="font-medium text-foreground">₹50</span>
            </div>
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="text-muted-foreground">Total Trip Cost:</span>
              <span className="font-semibold text-foreground">₹220</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Available Seats:</span>
              <span className="font-medium text-foreground">{formData?.availableSeats || 1}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Suggested Fare/Seat:</span>
              <span className="font-semibold text-success">₹{calculatedFare}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant={useCalculated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUseCalculated(true)}
          >
            Use Suggested
          </Button>
          <Button
            variant={!useCalculated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUseCalculated(false)}
          >
            Set Custom
          </Button>
        </div>

        <Label>
        Fare per Seat (₹)
        </Label>
        <Input
          type="number"
          value={formData?.pricing?.farePerSeat}
          onChange={(e) => {
            setUseCalculated(false);
            handlePricingChange('farePerSeat', parseInt(e?.target?.value) || 0);
          }}
          // @ts-expect-error: 'label' prop is custom for our Input component
          error={errors?.farePerSeat}
          min={1}
          required
          description={`Total earnings: ₹${totalEarnings}`}
        />
      </div>

      {/* Payment Methods */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          Accepted Payment Methods
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {paymentMethods.map((method) => (
            <Button
              key={method.id}
              variant={formData?.pricing?.paymentMethods?.includes(method.id) ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePaymentMethodToggle(method.id)}
              className="justify-start"
            >
                <Icon name={method.icon} size={20} />
              {method.label}
            </Button>
          ))}
        </div>
        {errors?.paymentMethods && (
          <p className="text-sm text-error mt-2">{errors.paymentMethods}</p>
        )}
      </div>

      {/* Cost Sharing Explanation */}
      <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 flex items-start space-x-3">
        <Icon name="Calculator" size={20} className="text-accent mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2">How Cost Sharing Works</h4>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>• Passengers pay their share before the trip</p>
            <p>• Funds are held securely until trip completion</p>
            <p>• You receive payment after successful ride</p>
            <p>• Platform fee: 5% of total earnings</p>
          </div>
        </div>
      </div>

      {/* Earnings Breakdown */}
      <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold text-foreground mb-2">Earnings Breakdown</h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Gross Earnings:</span>
          <span className="font-medium text-foreground">₹{totalEarnings}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Platform Fee (5%):</span>
          <span className="font-medium text-foreground">-₹{Math.ceil(totalEarnings * 0.05)}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-success/20 pt-2">
          <span className="font-medium text-foreground">Net Earnings:</span>
          <span className="font-semibold text-success">₹{totalEarnings - Math.ceil(totalEarnings * 0.05)}</span>
        </div>
      </div>
    </div>
  );
};

export default PricingSection;
