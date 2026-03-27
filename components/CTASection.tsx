import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const CTASection = () => {
  return (
    <section className="py-20 mb-6 bg-accent">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-4xl font-bold text-accent-foreground mb-6">
          Ready to Start Sharing Rides?
        </h2>
        <p className="text-xl text-accent-foreground/80 mb-8 max-w-2xl mx-auto">
          Join thousands of students already using Petrol Partner for safe,
          affordable rides
        </p>
        <Button
          size="lg"
          className="text-lg px-8 py-6 hover:scale-105 transition-transform duration-300"
          asChild
        >
          <Link href="/sign-up">Get Started Today</Link>
        </Button>
      </div>
    </section>
  );
};

export default CTASection;