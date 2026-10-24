import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eksara — Secure document sharing for print",
  description: "Eksara is a private document sharing and one-time print protocol designed for Monad. Explore customer, print shop, and pricing workflows.",
  icons: { icon: "/images/eksara-mark.png", apple: "/images/eksara-mark.png" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
