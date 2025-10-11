'use client';

import React from 'react';
import Skeleton from 'react-loading-skeleton';
import Icon from '../AppIcon';
import { Button } from '../ui/button';

interface SafetyPanelProps {
  onEmergencyContact?: () => void;
  onShareLocation?: () => void;
  onReportIssue?: () => void;
  safetyTips?: string[];
  isLoading?: boolean;
}

const SafetyPanel: React.FC<SafetyPanelProps> = ({
  onEmergencyContact,
  onShareLocation,
  onReportIssue,
  safetyTips = [
    'Verify driver details before getting in the car',
    'Share ride details with trusted contacts',
    'Keep emergency contacts easily accessible',
    'Trust your instincts - report any concerns',
  ],
  isLoading = false,
}) => {
  const safetyFeatures = [
    {
      icon: 'Phone',
      title: 'Emergency Contacts',
      description: 'Quick access to emergency services and your trusted contacts',
      action: onEmergencyContact,
      variant: 'destructive',
    },
    {
      icon: 'MapPin',
      title: 'Live Location Sharing',
      description: 'Share your real-time location with family and friends',
      action: onShareLocation,
      variant: 'outline',
    },
    {
      icon: 'Flag',
      title: 'Report Issue',
      description: 'Report safety concerns or inappropriate behavior',
      action: onReportIssue,
      variant: 'outline',
    },
  ];

  return (
    <div className="bg-card rounded-lg p-4 border border-border shadow-soft">
      {/* Header */}
      <div className="flex items-center space-x-2 mb-4">
        {isLoading ? (
          <Skeleton circle height={20} width={20} />
        ) : (
          <Icon name="Shield" size={20} className="text-success" />
        )}
        {isLoading ? (
          <Skeleton height={20} width={140} />
        ) : (
          <h3 className="text-lg font-semibold text-foreground">Safety & Security</h3>
        )}
      </div>

      <div className="space-y-3">
        {(isLoading ? Array.from({ length: 3 }) : safetyFeatures).map((feature: any, index: number) => (
          <div key={index} className="border border-border rounded-lg p-3">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                {isLoading ? <Skeleton circle height={18} width={18} /> : <Icon name={feature.icon} size={18} className="text-muted-foreground" />}
              </div>
              <div className="flex-1">
                {isLoading ? (
                  <>
                    <Skeleton height={14} width={120} className="mb-1" />
                    <Skeleton height={12} width={`80%`} className="mb-3" />
                    <Skeleton height={28} width={100} />
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-1">{feature.title}</h4>
                    <p className="text-xs text-muted-foreground mb-3">{feature.description}</p>
                    <Button
                      variant={feature.variant as 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | undefined}
                      size="sm"
                      onClick={feature.action}
                    >
                      <Icon name={feature.icon} />
                      {feature.title}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Safety Tips */}
      {isLoading ? (
        <div className="mt-4 p-3 bg-success/10 rounded-lg space-y-2">
          <Skeleton height={14} width={100} />
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height={12} width={`90%`} />
          ))}
        </div>
      ) : (
        safetyTips.length > 0 && (
          <div className="mt-4 p-3 bg-success/10 rounded-lg">
            <div className="flex items-start space-x-2">
              <Icon name="Lightbulb" size={16} className="text-success mt-0.5" />
              <div>
                <p className="text-sm font-medium text-success mb-2">Safety Tips</p>
                <ul className="text-xs text-foreground space-y-1">
                  {safetyTips.map((tip, idx) => (
                    <li key={idx}>• {tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default SafetyPanel;
