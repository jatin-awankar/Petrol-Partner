import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Clock3, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import styles from "./landing.module.css";

const steps = [
  { number: "01", title: "Find your way", copy: "Browse ride offers for the fixed college corridor, with stops, time, seats, and contribution shown upfront." },
  { number: "02", title: "Request one seat", copy: "Send a request for yourself. It stays pending until the driver accepts, so you always know where you stand." },
  { number: "03", title: "Close the loop", copy: "After the trip, confirm the journey and record the contribution and receipt separately." },
];
const laterFeatures = ["In-app chat", "Live trip tracking", "In-app payments", "More college corridors"];

export default function LandingPage() {
  return <main className={styles.page}>
    <div className={styles.announcement}><span className={styles.announcementDot} />Preparing a supervised pilot for the Amravati University–PRMITR corridor</div>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Petrol Partner home"><span className={styles.brandMark} aria-hidden="true"><i /><i /></span>petrol<span>partner.</span></Link>
      <nav className={styles.nav} aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#pilot">The pilot</a><a href="#roadmap">What&apos;s next</a></nav>
      <Link className={styles.headerLogin} href="/login">Sign in <ArrowUpRight size={15} /></Link>
    </header>

    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>A better way along the same road</p>
        <h1 id="hero-heading">Good journeys<br />start <em>together.</em></h1>
        <p className={styles.heroLead}>A thoughtful way for verified students to share a college corridor ride, agree on the details, and stay clear on what happens next.</p>
        <div className={styles.heroActions}><Link className={styles.primaryButton} href="/register">Create an account <ArrowUpRight size={18} /></Link><a className={styles.textButton} href="#how-it-works">See how it works <ArrowRight size={17} /></a></div>
        <p className={styles.heroNote}><ShieldCheck size={16} />Pilot participation requires verification and approval.</p>
      </div>
      <div className={styles.heroVisual} role="img" aria-label="Illustration of the Amravati University to PRMITR corridor">
        <div className={styles.visualTop}><span>THE COLLEGE CORRIDOR</span><span>01 / 01</span></div>
        <div className={styles.mapCanvas}>
          <div className={styles.mapGrid} /><div className={styles.mapRoadOne} /><div className={styles.mapRoadTwo} /><div className={styles.routePath} />
          <div className={`${styles.mapPoint} ${styles.mapPointStart}`} /><div className={`${styles.mapPoint} ${styles.mapPointEnd}`} />
          <div className={styles.mapLabelStart}><small>START</small>Amravati<br />University</div><div className={styles.mapLabelEnd}><small>ARRIVE</small>PRMITR<br />Gate</div>
          <div className={styles.mapStamp}>AMRAVATI<br /><strong>↗</strong></div>
        </div>
        <div className={styles.visualBottom}><div><small>ONE FIXED ROUTE</small><strong>Familiar stops.<br />Shared direction.</strong></div><span>↘</span></div>
      </div>
    </section>

    <div className={styles.ticker} aria-label="Pilot principles"><span><ShieldCheck size={17} /> Verified adults</span><i /><span><MapPin size={17} /> Predefined stops</span><i /><span><UsersRound size={17} /> One seat per request</span><i /><span><Clock3 size={17} /> Clear deadlines</span></div>

    <section className={styles.stepsSection} id="how-it-works" aria-labelledby="steps-heading">
      <div className={styles.sectionIntro}><p className={styles.sectionKicker}>THE SIMPLE PART</p><h2 id="steps-heading">From &ldquo;is there a seat?&rdquo;<br />to <em>see you there.</em></h2><p>Each step says what is confirmed, what is waiting, and who acts next.</p></div>
      <div className={styles.stepsGrid}>{steps.map(step => <article className={styles.step} key={step.number}><span className={styles.stepNumber}>{step.number}</span><div className={styles.stepLine} /><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div>
    </section>

    <section className={styles.pilotSection} id="pilot" aria-labelledby="pilot-heading">
      <div className={styles.pilotHeading}><p className={styles.sectionKicker}>SMALL BY DESIGN</p><h2 id="pilot-heading">One corridor.<br /><em>Real clarity.</em></h2><p>The first pilot is planned for 20–30 approved adult students travelling between Amravati University and PRMITR. It starts with a small set of agreed stops and approved private cars.</p><Link className={styles.pilotLink} href="/register">Create an account <ArrowUpRight size={18} /></Link></div>
      <div className={styles.pilotCard}><div className={styles.pilotCardHeader}><span>THE PILOT, AT A GLANCE</span><span>001</span></div><div className={styles.pilotCardRoute}><span className={styles.routeCircle} />Amravati University<span className={styles.routeDash} /><span className={styles.routeCircle} />PRMITR</div><div className={styles.pilotRules}>
        <p><Check size={18} />Students and drivers are approved before participating.</p>
        <p><Check size={18} />A request is confirmed only when the driver accepts.</p>
        <p><Check size={18} />Contribution details are visible before a request.</p>
        <p><Check size={18} />Journey and payment records have separate confirmations.</p>
      </div><p className={styles.pilotCardFoot}>Real trips begin only after the pilot&apos;s operational and safety gates are met.</p></div>
    </section>

    <section className={styles.roadmapSection} id="roadmap" aria-labelledby="roadmap-heading"><div className={styles.roadmapIntro}><p className={styles.sectionKicker}>A LOOK AHEAD</p><h2 id="roadmap-heading">The road doesn&apos;t<br />end here.</h2><p>These ideas are part of the broader vision. They are not available in the first pilot.</p></div><div className={styles.roadmapList}>{laterFeatures.map((feature, index) => <div className={styles.roadmapItem} key={feature}><span>0{index + 1}</span><strong>{feature}</strong><span className={styles.plannedTag}>PLANNED</span><ArrowUpRight size={20} /></div>)}</div></section>

    <section className={styles.finalCta} aria-labelledby="final-heading"><div><p className={styles.sectionKicker}>YOUR ROUTE, TOGETHER</p><h2 id="final-heading">The journey feels<br />better <em>shared.</em></h2></div><div><p>Create an account to begin the verification process for this supervised pilot.</p><Link className={styles.lightButton} href="/register">Create an account <ArrowUpRight size={18} /></Link></div></section>
    <footer className={styles.footer}><span className={styles.footerBrand}>petrol<span>partner.</span></span><span>Made for a more thoughtful commute.</span><div><Link href="/login">Sign in</Link><a href="#hero-heading">Back to top ↑</a></div></footer>
  </main>;
}
