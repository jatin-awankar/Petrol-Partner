import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import LoginForm from "@/components/LoginForm";
import { CheckCircle2, Clock3, MapPin, ShieldCheck, Wallet } from "lucide-react";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  }

  const highlights = [
    {
      title: "Verified student community",
      detail: "Commute with authenticated college profiles only.",
      icon: ShieldCheck,
    },
    {
      title: "Route-first ride matching",
      detail: "Find seats by exact pickup and drop path.",
      icon: MapPin,
    },
    {
      title: "Fair split pricing",
      detail: "Transparent per-seat costs before you book.",
      icon: Wallet,
    },
  ];

  return (
    <main className="min-h-screen">
      <div className="page py-5 md:py-8">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
          <section className="order-2 rounded-3xl border border-border/80 bg-gradient-hero p-5 shadow-soft md:p-8 lg:order-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Clock3 size={13} />
              Daily ride flow
            </p>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Welcome back. Let&apos;s get your next campus ride sorted.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              Sign in once, then switch freely between finding a ride and
              posting one. No separate driver or passenger login needed.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">6 min</p>
                <p className="text-xs text-muted-foreground">Avg. seat match time</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">140+</p>
                <p className="text-xs text-muted-foreground">Active campus groups</p>
              </div>
              <div className="rounded-2xl border border-border bg-card/75 p-3">
                <p className="text-lg font-semibold text-foreground">24x7</p>
                <p className="text-xs text-muted-foreground">Ride coordination</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-card/80 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <item.icon size={16} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="order-1 rounded-3xl border border-border/80 bg-card/70 p-2 shadow-soft backdrop-blur-sm md:p-3 lg:order-2">
            <LoginForm />
            <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground">
              <p className="inline-flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" />
                Your session stays secure and tied to your verified account.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
