"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabase/client";
import { Calendar, ExternalLink, Heart, Share2, Shield, User, Users } from "lucide-react";

interface Update {
  id: string | number;
  type: "announcement" | "community" | "event";
  title: string;
  content: string;
  timestamp: string;
  author: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  image: string;
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  announcement: { icon: <Shield size={16} className="text-primary" />, color: "text-primary", bgColor: "bg-primary/10" },
  community: { icon: <Users size={16} className="text-green-600" />, color: "text-green-600", bgColor: "bg-green-100" },
  event: { icon: <Calendar size={16} className="text-accent" />, color: "text-accent", bgColor: "bg-accent/10" },
};

const CommunityUpdates = () => {
  const router = useRouter();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpdates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabaseClient
          .from("community_updates") // make sure this table exists
          .select("id, type, title, content, created_at, author, image_url")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) throw error;

        const mapped: Update[] =
          data?.map((u) => {
            const cfg = typeConfig[u.type] || typeConfig.announcement;
            return {
              id: u.id,
              type: u.type,
              title: u.title,
              content: u.content,
              timestamp: new Date(u.created_at).toLocaleString(),
              author: u.author || "Petrol Partner Team",
              icon: cfg.icon,
              color: cfg.color,
              bgColor: cfg.bgColor,
              image: u.image_url || "/default-banner.jpg",
            };
          }) ?? [];

        setUpdates(mapped);
      } catch (err) {
        console.error("Error fetching community updates:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUpdates();
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Community Updates</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/community")}
        >
          <ExternalLink name="ExternalLink" size={14} />
          View All
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates available</p>
      ) : (
        <div className="space-y-4">
          {updates.map((update) => (
            <div
              key={update.id}
              className="border border-border rounded-lg overflow-hidden"
            >
              {/* Image */}
              <div className="relative h-32 overflow-hidden">
                <Image
                  src={update.image}
                  alt={update.title}
                  className="w-full h-full object-cover"
                />
                <div
                  className={`absolute top-3 left-3 w-8 h-8 ${update.bgColor} rounded-lg flex items-center justify-center`}
                >
                  {update.icon}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-foreground line-clamp-1">
                    {update.title}
                  </h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {update.timestamp}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                  {update.content}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                      <User name="User" size={12} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {update.author}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm">
                      <Heart name="Heart" size={14} />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Share2 name="Share2" size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityUpdates;
