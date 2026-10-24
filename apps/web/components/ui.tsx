"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, FileText, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { readUser, saveUser, isDemo } from "@/lib/demo";
import type { User } from "@/lib/types";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="Eksara home"><Image className="brand-mark" src="/images/eksara-mark.png" alt="" width={38} height={38} priority/>{!compact && <span>Eksara</span>}</Link>;
}

export function SiteHeader({ app = false }: { app?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  useEffect(() => {
    const sync = () => setUser(readUser());
    sync(); window.addEventListener("eksara:change", sync);
    return () => window.removeEventListener("eksara:change", sync);
  }, []);
  const links = app ? [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/documents", label: "My Documents", icon: FileText },
    { href: "/app/orders", label: "Order History", icon: FileText },
    { href: "/#how-it-works", label: "Help", icon: FileText }
  ] : [
    { href: "/", label: "Home" }, { href: "/#product", label: "Product" },
    { href: "/#use-cases", label: "Use Cases" }, { href: "/#protocol", label: "Protocol" },
    { href: "/#privacy", label: "Privacy" }, { href: "/#pricing", label: "Pricing" }
  ];
  return <header className="site-header"><div className="header-inner shell">
    <Brand />
    <nav className={`nav-links ${menu ? "open" : ""}`} aria-label="Main navigation">
      {links.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""} onClick={() => setMenu(false)}>{item.label}</Link>)}
    </nav>
    <div className="header-actions">
      {app ? <>
        {isDemo && <span className="demo-pill">Demo mode</span>}
        <button className="icon-button bell" aria-label="Notifications" title="No new notifications"><Bell size={19}/></button>
        <div className="profile-wrap"><button className="profile-button" onClick={() => setProfile(!profile)} aria-expanded={profile}>
          <span className="avatar">{user?.picture ? <img src={user.picture} alt=""/> : (user?.name?.[0] || "P")}</span>
          <span className="profile-name">{user?.name || "Preview User"}</span><ChevronDown size={15}/>
        </button>{profile && <div className="profile-menu"><span>{user?.email || "Local preview"}</span><button onClick={async () => { if (!isDemo) await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {}); saveUser(null);setProfile(false);router.push("/"); }}><LogOut size={15}/> Sign out</button></div>}</div>
      </> : <Link href={user ? "/app" : "/login"} className="btn btn-dark header-cta">{user ? "Open App" : "Open App"}</Link>}
      <button className="icon-button mobile-menu" aria-label={menu ? "Close menu" : "Open menu"} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>
    </div>
  </div></header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="shell footer-inner"><div className="footer-brand"><Brand/><span>Secure documents. Real world prints.</span></div><div className="footer-links"><Link href="/#product">Product</Link><Link href="/#protocol">Protocol</Link><Link href="/#privacy">Privacy</Link><Link href="/#pricing">Pricing</Link></div><div className="monad-footer">Designed for <strong>Monad</strong><span>For a more open world.</span></div></div></footer>;
}

export function StepTitle({ number, title, subtitle, action }: { number: number; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="step-title"><span className="step-number">{number}</span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="step-action">{action}</div>}</div>;
}
