"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiBase, readUser, saveUser } from "@/lib/demo";
import { getMe } from "@/lib/api";

export function AppGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const [ready, setReady] = useState(false);
  useEffect(() => { let active = true; (async () => {
    const login = () => router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    if (apiBase) { try { saveUser(await getMe()); } catch { login(); return; } }
    else if (!readUser()) { login(); return; }
    if (active) setReady(true);
  })(); return () => { active = false; }; }, [router]);
  return ready ? <>{children}</> : <div className="loading-screen">Opening your workspace…</div>;
}
