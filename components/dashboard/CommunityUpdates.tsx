'use client';

import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Button } from "../ui/button";
import { ExternalLink } from "lucide-react";
import Icon from "../AppIcon";
import AppImage from "../AppImage";

interface CommunityUpdate {
  id: number | string;
  type: string;
  title: string;
  content: string;
  timestamp: string;
  author: string;
  icon: string;
  color: string;
  bgColor: string;
  image: string;
}

const CommunityUpdates: React.FC = () => {
  const [updates, setUpdates] = useState<CommunityUpdate[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setUpdates([
        {
          id: 1,
          type: "announcement",
          title: "New Safety Features Added",
          content:
            "We have introduced real-time location sharing and emergency SOS button for enhanced safety during rides.",
          timestamp: "2 hours ago",
          author: "Petrol Partner Team",
          icon: "Shield",
          color: "text-primary",
          bgColor: "bg-primary/10",
          image:
            "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=200&fit=crop",
        },
        {
          id: 2,
          type: "community",
          title: "Student Spotlight: Eco Warriors",
          content:
            "Meet our top eco-friendly riders who have collectively saved over 500kg of CO₂ this month through ride sharing!",
          timestamp: "1 day ago",
          author: "Community Team",
          icon: "Users",
          color: "text-success",
          bgColor: "bg-success/10",
          image:
            "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=200&fit=crop",
        },
        {
          id: 3,
          type: "event",
          title: "Campus Carpool Week",
          content:
            "Join us for Campus Carpool Week! Special rewards for students who share rides. Reduce traffic and win prizes.",
          timestamp: "3 days ago",
          author: "Events Team",
          icon: "Calendar",
          color: "text-accent",
          bgColor: "bg-accent/10",
          image:
            "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&h=200&fit=crop",
        },
      ]);
      setLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Community Updates
        </h2>
        <Button variant="ghost" size="sm">
          <ExternalLink />
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {loading
          ? Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg overflow-hidden animate-pulse"
              >
                <div className="relative h-32 bg-gray-200"></div>
                <div className="p-4 space-y-2">
                  <Skeleton width="70%" height={16} />
                  <Skeleton width="90%" height={12} />
                  <Skeleton width="80%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
            ))
          : updates?.map((update) => (
              <div
                key={update?.id}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Image */}
                <div className="relative h-32 overflow-hidden">
                  <AppImage
                    src={update?.image ?? ""}
                    alt={update?.title ?? "Community Update"}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className={`absolute top-3 left-3 w-8 h-8 ${update?.bgColor} rounded-lg flex items-center justify-center`}
                  >
                    <Icon
                      name={update?.icon ?? "Info"}
                      size={16}
                      className={update?.color ?? "text-foreground"}
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-foreground line-clamp-1">
                      {update?.title ?? "Untitled"}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {update?.timestamp ?? "-"}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {update?.content ?? ""}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                        <Icon name="User" size={12} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {update?.author ?? "Unknown"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm">
                        <Icon name="Heart" size={14} />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Icon name="Share2" size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
};

export default CommunityUpdates;
