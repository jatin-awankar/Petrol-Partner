import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, MapPin } from "lucide-react";
import styles from "./landing.module.css";

const steps = [
  {
    number: "01",
    tag: "LOOK",
    title: "Find your ride.",
    copy: "See offers on the college corridor with the stops, departure, seats, and contribution upfront.",
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
    copy: "After the ride, confirm the journey. Payment claims and receipts get their own clear record.",
  },
];

const futureFeatures = [
  "In-app chat",
  "Live trip tracking",
  "In-app payments",
  "More college corridors",
];

export const metadata: Metadata = {
  title: "Petrol Partner | Share the college corridor",
  description:
    "A supervised ride-sharing pilot for verified adult students travelling between Amravati University and PRMITR.",
};

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.notice}>
        <span className={styles.noticeDot} />
        A small, supervised pilot is in the works · Amravati University ↗ PRMITR
      </div>

      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Petrol Partner home">
          <span className={styles.brandGlyph} aria-hidden="true">p<span>p</span></span>
          <span>petrol<br />partner<span className={styles.brandPeriod}>.</span></span>
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#pilot">The pilot</a>
          <a href="#future">What&apos;s next</a>
        </nav>
        <Link className={styles.signIn} href="/login">Sign in <ArrowUpRight size={17} /></Link>
      </header>

      <section className={styles.hero} id="main-content" tabIndex={-1} aria-labelledby="hero-heading">
        <div className={styles.heroCopy}>
          <div className={styles.heroLabel}><span>THE COLLEGE CORRIDOR, REIMAGINED</span><span>EST. FOR THE EVERYDAY</span></div>
          <h1 id="hero-heading">SAME<br /><span className={styles.outlineWord}>ROUTE.</span><br /><span className={styles.highlightWord}>BETTER</span><br />RIDE<span className={styles.heroDot}>.</span></h1>
          <div className={styles.heroLower}>
            <p>Heading the same way? Find a seat with an approved student driver, know the details before you ask, and keep the whole trip clear from start to finish.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/register">Create an account <ArrowUpRight size={19} /></Link>
              <a className={styles.secondaryLink} href="#how-it-works">See the idea <ArrowDown size={16} /></a>
            </div>
            <small>Participation requires verification and approval. Real trips start after pilot launch gates are met.</small>
          </div>
        </div>

        <div className={styles.heroArt} aria-label="Illustrated Petrol Partner corridor pass" role="img">
          <span className={styles.cornerCode}>PP / ROUTE 001</span>
          <span className={styles.cornerStar} aria-hidden="true">✦</span>
          <div className={styles.ticket}>
            <div className={styles.ticketTop}><span>YOUR CORRIDOR PASS</span><span>AMRAVATI / MH</span></div>
            <div className={styles.ticketRoute}>
              <div><small>FROM</small><strong>Amravati<br />University</strong></div>
              <div className={styles.routeGraphic} aria-hidden="true"><i /><b /><i /></div>
              <div><small>TO</small><strong>PRMITR<br />Gate</strong></div>
            </div>
            <div className={styles.ticketGrid}>
              <div><small>SEAT</small><strong>Just yours.</strong></div>
              <div><small>STATUS</small><strong>Clear at every step.</strong></div>
            </div>
            <div className={styles.ticketBottom}><span>FIND IT. REQUEST IT. RIDE.</span><span className={styles.barcode} aria-hidden="true" /></div>
          </div>
          <span className={styles.artStamp}>NO<br />GUESSWORK<br /><i>↗</i></span>
          <div className={styles.artFooter}><span>ONE ROUTE. A SMALL PILOT. A BETTER ROUTINE.</span><span>01 — 03</span></div>
        </div>
      </section>

      <div className={styles.marquee} aria-label="Pilot essentials"><span>VERIFIED ADULT STUDENTS</span><i aria-hidden="true">✳</i><span>FIXED STOPS</span><i aria-hidden="true">✳</i><span>ONE SEAT PER REQUEST</span><i aria-hidden="true">✳</i><span>NO MYSTERY STATUS</span><i aria-hidden="true">✳</i></div>

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

      <section className={styles.pilot} id="pilot" aria-labelledby="pilot-heading">
        <div className={styles.pilotCopy}>
          <p className={styles.kicker}>02 / THE PILOT</p>
          <h2 id="pilot-heading">SMALL<br />ON <span>PURPOSE.</span></h2>
          <p>We&apos;re preparing a supervised pilot for 20–30 approved adult students between Amravati University and PRMITR. One corridor. A small set of stops. Approved private cars.</p>
          <Link href="/register" className={styles.pilotLink}>Create an account <ArrowUpRight size={18} /></Link>
        </div>
        <div className={styles.pilotBoard}>
          <div className={styles.boardTop}><span>THE RULES OF THE ROAD</span><span>001 / 001</span></div>
          <div className={styles.boardRoute}><MapPin size={22} /><span>Amravati University</span><span className={styles.boardLine} /><span>PRMITR</span></div>
          <div className={styles.boardList}>
            <p><Check size={19} />Verified and approved people participate.</p>
            <p><Check size={19} />A request is pending until the driver accepts.</p>
            <p><Check size={19} />The contribution is visible before you request.</p>
            <p><Check size={19} />Journey and payment confirmations stay separate.</p>
          </div>
          <small>Real trips begin only when the pilot&apos;s operational and safety gates are met.</small>
        </div>
      </section>

      <section className={styles.future} id="future" aria-labelledby="future-heading">
        <div className={styles.futureIntro}>
          <p className={styles.kicker}>03 / WHAT&apos;S NEXT</p>
          <h2 id="future-heading">MORE ROAD<br /><span>AHEAD.</span></h2>
          <p>Good ideas for later. These are part of the broader vision and are not available in the first pilot.</p>
        </div>
        <div className={styles.futureList}>{futureFeatures.map((feature, index) => (
          <div className={styles.futureRow} key={feature}><span>0{index + 1}</span><strong>{feature}</strong><em>PLANNED</em><ArrowUpRight size={20} /></div>
        ))}</div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-heading"><span className={styles.ctaSun} aria-hidden="true">✳</span><div><p className={styles.kicker}>GOOD RIDES START SOMEWHERE</p><h2 id="cta-heading">LET&apos;S GO<br /><span>TOGETHER.</span></h2></div><div className={styles.ctaRight}><p>Create an account to begin verification for the supervised pilot.</p><Link href="/register">Create an account <ArrowUpRight size={20} /></Link></div></section>
      <footer className={styles.footer}><span>petrol partner<span>.</span></span><small>For the route you already know.</small><div><Link href="/login">Sign in</Link><a href="#hero-heading">Back to top ↑</a></div></footer>
    </main>
  );
}
