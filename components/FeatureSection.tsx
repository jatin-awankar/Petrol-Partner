import { CreditCard, MapPin, MessageSquare, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const FeatureSection = () => {
  return (
    <section className="px-3 md:px-20 py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Why Choose Petrol Partner?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Built specifically for college students with safety and convenience
            in mind
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              icon: MapPin,
              title: "Smart Matching",
              description:
                "Find rides based on your route, timing, and preferences",
            },
            {
              icon: MessageSquare,
              title: "Safe Communication",
              description:
                "In-app messaging with verified college students only",
            },
            {
              icon: CreditCard,
              title: "Easy Payments",
              description:
                "Built-in wallet system for seamless expense sharing",
            },
            {
              icon: Star,
              title: "Rating System",
              description:
                "Community-driven ratings ensure reliable ride partners",
            },
          ].map((feature, index) => (
            <Card
              key={index}
              className="border-0 shadow-card hover:shadow-soft hover:scale-105 hover:-translate-y-2 transition-all duration-300 cursor-pointer group"
            >
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 group-hover:animate-pulse">
                  <feature.icon className="w-8 h-8 text-white transition-transform duration-300 group-hover:scale-110" />
                </div>
                <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureSection;