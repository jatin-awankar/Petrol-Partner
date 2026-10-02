"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CircleUserRound, Compass, House, Menu, Route, ReceiptText, X, LogOut, ShieldCheck, Archive } from "lucide-react";
import { useCurrentUser } from "@/hooks/auth/useCurrentUser";

const destinations = [
  { label: "Home", href: "/dashboard", icon: House, available: true },
  { label: "Find a ride", href: "/find-a-ride", icon: Compass, available: false },
  { label: "Offer a ride", href: "/offer-a-ride", icon: Route, available: false },
  { label: "Trips", href: "/trips", icon: Route, available: true },
  { label: "Contributions", href: "/direct-settlements", icon: ReceiptText, available: true },
] as const;

export default function ParticipantShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  if (loading || !user || pathname === "/" || pathname.startsWith("/operator") || ["/login", "/register", "/recover", "/auth/callback"].some(path => pathname.startsWith(path))) return null;
  const current = destinations.find(item => item.href === pathname);
  async function signOut() { await logout(); router.push("/login"); router.refresh(); }
  return <>
    <a href="#main-content" className="shell-skip">Skip to content</a>
    <header className="participant-header">
      <div className="participant-header-inner">
        <Link href="/dashboard" className="participant-brand" aria-label="Petrol Partner home"><span className="participant-mark" aria-hidden="true">pp<span>.</span></span><span>petrol<br/>partner</span></Link>
        <nav aria-label="Participant" className="participant-desktop-nav">{destinations.map(({label,href,icon:Icon,available}) => <Link key={label} href={href} aria-current={current?.label === label ? "page" : undefined} className="participant-nav-link"><Icon size={17}/><span>{label}</span>{!available && <span className="nav-gate">Later</span>}</Link>)}</nav>
        <div className="participant-header-actions"><Link className="participant-icon-link" href="/notifications" aria-label="Notifications"><Bell size={20}/></Link><button ref={menuButton} className="participant-menu-button" aria-expanded={open} aria-controls="participant-menu" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}>{open ? <X size={22}/> : <Menu size={22}/>}</button></div>
      </div>
      {open && <nav id="participant-menu" aria-label="Participant menu" className="participant-menu">
        <div className="participant-mobile-links">{destinations.map(({label,href,icon:Icon,available}) => <Link key={label} href={href} onClick={() => setOpen(false)}><Icon size={18}/>{label}{!available && <span className="nav-gate">Later</span>}</Link>)}</div>
        <p className="participant-menu-title">Your account</p>
        <Link href="/notifications" onClick={() => setOpen(false)}><Bell size={18}/>Notifications</Link>
        <Link href="/profile-settings" onClick={() => setOpen(false)}><CircleUserRound size={18}/>Account settings</Link>
        <Link href="/adult-declaration" onClick={() => setOpen(false)}><ShieldCheck size={18}/>Adult declaration</Link>
        <Link href="/eligibility" onClick={() => setOpen(false)}><Archive size={18}/>Historical pilot eligibility</Link>
        <Link href="/direct-settlements" onClick={() => setOpen(false)}><ReceiptText size={18}/>Contribution records</Link>
        {user.role === "admin" && <Link href="/operator/mfa" onClick={() => setOpen(false)}><ShieldCheck size={18}/>Operator access</Link>}
        <button onClick={() => void signOut()}><LogOut size={18}/>Sign out</button>
      </nav>}
    </header>
    <nav className="participant-bottom-nav" aria-label="Participant quick navigation">{destinations.filter(item => item.label !== "Contributions").map(({label,href,icon:Icon,available}) => <Link key={label} href={href} onClick={() => setOpen(false)} aria-current={current?.label === label ? "page" : undefined}><Icon size={20}/><span>{label}</span>{!available && <span className="nav-gate">Later</span>}</Link>)}</nav>
  </>;
}
