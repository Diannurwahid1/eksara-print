"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/ui";
import { Button } from "@/components/button";
import { apiBase, readUser, saveUser } from "@/lib/demo";

function LoginContent() {
  const router = useRouter(); const params = useSearchParams();
  useEffect(() => { if (!apiBase && readUser()) router.replace(params.get("next") || "/app"); }, [router, params]);
  function preview() { saveUser({ name: "Alex Chen", email: "demo@eksara.local" }); router.push(params.get("next") || "/app"); }
  function google() { if (apiBase) window.location.href = `${apiBase}/v1/auth/google/start?returnTo=${encodeURIComponent(params.get("next") || "/app")}`; }
  return <div className="login-page"><div className="login-top shell"><Brand/><Link href="/" className="back-link">← Back to home</Link></div><main className="login-layout shell"><div className="login-story"><div className="eyebrow">YOUR DOCUMENTS, YOUR CONTROL</div><h1>Print with confidence, from anywhere.</h1><p>Keep the file in one secure place. Send the print shop a link and PIN when you are ready.</p><div className="login-benefits"><span><LockKeyhole/> PIN-protected access</span><span><ShieldCheck/> One-time print release</span></div></div><div className="login-card"><div className="login-card-icon"><Image src="/images/eksara-mark.png" alt="" width={54} height={54}/></div><h2>Welcome to Eksara</h2><p>Sign in to prepare documents, share access, and follow your print requests.</p><Button variant="outline" className="google-button" onClick={google} disabled={!apiBase}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.91a6 6 0 0 1 0-3.82V7.51H3.06a10 10 0 0 0 0 8.98l3.34-2.58Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.56 9.56 0 0 0 12 2a10 10 0 0 0-8.94 5.51l3.34 2.58C7.19 7.73 9.4 5.97 12 5.97Z"/></svg> Continue with Google</Button>
      {!apiBase && <p className="auth-note">Google sign-in becomes available when the NestJS API is configured.</p>}
      {!apiBase && <><div className="login-divider"><span/>or explore the frontend<span/></div><Button variant="outline" className="preview-button" onClick={preview}>Enter demo workspace <ArrowRight size={17}/></Button><small>Demo data stays in this browser. No file is uploaded or printed.</small></>}</div></main></div>;
}
export default function LoginPage() { return <Suspense><LoginContent/></Suspense>; }
