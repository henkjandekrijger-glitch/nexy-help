import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "Samen verder · Proxy", description: "Praat vrij. Vind andere perspectieven. Ontdek wat jou verder helpt.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { readonly children: ReactNode }) { return <html lang="nl"><body>{children}</body></html>; }
