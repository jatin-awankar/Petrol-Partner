import type { ReactNode } from "react";
import Link from "next/link";
import { Clock3, MapPin, ShieldCheck } from "lucide-react";

interface AuthSplitLayoutProps {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

const platformHighlights = [
  {
    id: "verified",
    title: "Your account first",
    description: "Confirm email ownership, then review your next account step.",
    icon: ShieldCheck,
  },
  {
    id: "match",
    title: "Driver-posted routes",
    description: "Route discovery and seat requests will open after launch checks.",
    icon: MapPin,
  },
  {
    id: "settlement",
    title: "Direct contributions",
    description: "Participants will pay each other directly when real trips are approved.",
    icon: Clock3,
  },
];

export default function AuthSplitLayout({
  badge,
  title,
  description,
  children,
  footer,
}: AuthSplitLayoutProps) {
  return (
    <div className="relative min-h-screen flex items-center overflow-hidden bg-gradient-hero px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card backdrop-blur md:p-8">
          <Link href="/" className="mb-5 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">← Petrol Partner home</Link>
          {children}
          <div className="mt-6 border-t border-border/80 pt-4 text-sm text-muted-foreground [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
            {footer}
            <Link href="/support" className="underline underline-offset-4">Help and support</Link>
          </div>
        </section>

        <section className="hidden rounded-2xl border border-border/70 bg-card/75 p-8 shadow-soft backdrop-blur lg:order-first lg:block lg:p-10">
          <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {badge}
          </span>
          <h2 className="mt-5 max-w-lg text-3xl font-semibold leading-tight text-foreground lg:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground lg:text-base">
            {description}
          </p>

          <div className="mt-8 space-y-3">
            {platformHighlights.map((item) => (
              <article
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                  <item.icon className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
