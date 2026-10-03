import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, MapPin } from "lucide-react";
import styles from "./landing.module.css";

const steps = [
  {
    number: "01",
    tag: "LOOK",
    title: "Find your ride.",
    copy: "Explore driver-posted routes, choose your pickup and drop-off, and see the route segment and contribution before asking.",
  },
  {
    number: "02",
    tag: "ASK",
    title: "Claim your spot.",
    copy: "Request one seat for yourself. Your request stays pending until the driver accepts it.",
  },
  {
    number: "03",
    tag: "GO",
    title: "Make it count.",
    copy: "After the ride, confirm what happened. Direct payment claims and receipts get their own clear record.",
  },
];

const futureFeatures = [
  "In-app chat",
  "Live trip tracking",
  "Platform payments",
  "Automatic matching",
];

export const metadata: Metadata = {
  title: "Petrol Partner | Same route. Better ride.",
  description:
    "Petrol Partner is preparing driver-posted route sharing with one-seat requests and direct contributions. Accounts are available; real ride bookings are not live.",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#landing-content">Skip to main content</a>
      <div className={styles.notice}>
        <span className={styles.noticeDot} />
        Accounts are open · Real ride bookings are not live yet
      </div>

      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Petrol Partner home">
          <span className={styles.brandGlyph} aria-hidden="true">p<span>p</span></span>
          <span>petrol<br />partner<span className={styles.brandPeriod}>.</span></span>
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#status">Right now</a>
          <a href="#future">What&apos;s next</a>
        </nav>
        <Link className={styles.signIn} href="/login">Sign in <ArrowUpRight size={17} /></Link>
      </header>

      <section className={styles.hero} id="landing-content" tabIndex={-1} aria-labelledby="hero-heading">
        <div className={styles.heroCopy}>
          <div className={styles.heroLabel}><span>FOR THE ROUTE YOU&apos;RE ALREADY TAKING</span><span>EST. FOR THE EVERYDAY</span></div>
          <h1 id="hero-heading">SAME<br /><span className={styles.outlineWord}>ROUTE.</span><br /><span className={styles.highlightWord}>BETTER</span><br />RIDE<span className={styles.heroDot}>.</span></h1>
          <div className={styles.heroLower}>
            <p>Heading the same way? The idea is simple: drivers post routes, riders choose where to hop on and off, and everyone sees the details before a seat is requested.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/register">Create an account <ArrowUpRight size={19} /></Link>
              <a className={styles.secondaryLink} href="#how-it-works">See the idea <ArrowDown size={16} /></a>
            </div>
            <small>An account does not enable ride bookings. Adult and driver–vehicle eligibility use self-declarations; real trips await launch approval.</small>
          </div>
        </div>

        <div className={styles.heroArt} aria-label="Illustrated example ticket for a driver-posted route" role="img">
          <span className={styles.cornerCode}>PP / ROUTE 001</span>
          <span className={styles.cornerStar} aria-hidden="true">✦</span>
          <div className={styles.ticket}>
            <div className={styles.ticketTop}><span>YOUR ROUTE PASS</span><span>ROUTE / 001</span></div>
            <div className={styles.ticketRoute}>
              <div><small>FROM</small><strong>Your<br />pickup</strong></div>
              <div className={styles.routeGraphic} aria-hidden="true"><i /><b /><i /></div>
              <div><small>TO</small><strong>Your<br />drop-off</strong></div>
            </div>
            <div className={styles.ticketGrid}>
              <div><small>SEAT</small><strong>Just yours.</strong></div>
              <div><small>STATUS</small><strong>Clear at every step.</strong></div>
            </div>
            <div className={styles.ticketBottom}><span>FIND IT. REQUEST IT. RIDE.</span><span className={styles.barcode} aria-hidden="true" /></div>
          </div>
          <span className={styles.artStamp}>NO<br />GUESSWORK<br /><i>↗</i></span>
          <div className={styles.artFooter}><span>ONE SEAT. YOUR STOPS. A CLEARER ROUTINE.</span><span>01 — 03</span></div>
        </div>
      </section>

      <div className={styles.marquee} aria-label="Route sharing essentials"><span>ADULT SELF-DECLARATION</span><i aria-hidden="true">✳</i><span>DRIVER-POSTED ROUTES</span><i aria-hidden="true">✳</i><span>ONE SEAT PER REQUEST</span><i aria-hidden="true">✳</i><span>NO MYSTERY STATUS</span><i aria-hidden="true">✳</i></div>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>01 / THE FLOW</p>
          <h2 id="how-heading">Not complicated.<br /><em>Just considered.</em></h2>
          <p>Every step tells you what happened and what comes next. No pretending a pending request is a confirmed seat.</p>
        </div>
        <div className={styles.stepGrid}>{steps.map((step) => (
          <article className={styles.step} key={step.number}>
            <div className={styles.stepTop}><span>{step.number}</span><span>{step.tag} ↗</span></div>
            <div className={styles.stepIcon} aria-hidden="true">{step.number === "01" ? "↗" : step.number === "02" ? "+" : "✓"}</div>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </article>
        ))}</div>
      </section>

      <section className={styles.pilot} id="status" aria-labelledby="status-heading">
        <div className={styles.pilotCopy}>
          <p className={styles.kicker}>02 / RIGHT NOW</p>
          <h2 id="status-heading">NOT LIVE.<br /><span>YET.</span></h2>
          <p>We&apos;re preparing route sharing beyond one college or corridor. Adults can declare their eligibility; drivers can declare a bike, scooter, or car and prepare a route. Discovering routes and requesting seats are waiting on launch approval.</p>
          <Link href="/register" className={styles.pilotLink}>Create an account <ArrowUpRight size={18} /></Link>
        </div>
        <div className={styles.pilotBoard}>
          <div className={styles.boardTop}><span>HOW IT&apos;S MEANT TO WORK</span><span>001 / 001</span></div>
          <div className={styles.boardRoute}><MapPin size={22} /><span>Your pickup</span><span className={styles.boardLine} /><span>Your drop-off</span></div>
          <div className={styles.boardList}>
            <p><Check size={19} />Adults and drivers make clear self-declarations.</p>
            <p><Check size={19} />A seat request waits for the driver&apos;s answer.</p>
            <p><Check size={19} />The route-segment quote comes before a request.</p>
            <p><Check size={19} />Cash or UPI goes directly between riders.</p>
          </div>
          <small>Real bookings remain closed while external review, support, testing, recovery, and launch decisions are unfinished.</small>
        </div>
      </section>

      <section className={styles.future} id="future" aria-labelledby="future-heading">
        <div className={styles.futureIntro}>
          <p className={styles.kicker}>03 / WHAT&apos;S NEXT</p>
          <h2 id="future-heading">MORE ROAD<br /><span>AHEAD.</span></h2>
          <p>Ideas beyond the planned route flow. These tools are unavailable now, with no launch date announced.</p>
        </div>
        <div className={styles.futureList}>{futureFeatures.map((feature, index) => (
          <div className={styles.futureRow} key={feature}><span>0{index + 1}</span><strong>{feature}</strong><em>LATER</em><ArrowUpRight size={20} /></div>
        ))}</div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-heading"><span className={styles.ctaSun} aria-hidden="true">✳</span><div><p className={styles.kicker}>GOOD RIDES START SOMEWHERE</p><h2 id="cta-heading">LET&apos;S GO<br /><span>TOGETHER.</span></h2></div><div className={styles.ctaRight}><p>Create an account and explore what&apos;s taking shape. Real ride bookings are not live yet.</p><Link href="/register">Create an account <ArrowUpRight size={20} /></Link></div></section>
      <footer className={styles.footer}><span>petrol partner<span>.</span></span><small>For the route you&apos;re already taking.</small><div><Link href="/support">Help and support</Link><Link href="/login">Sign in</Link><a href="#hero-heading">Back to top ↑</a></div></footer>
    </div>
  );
}
