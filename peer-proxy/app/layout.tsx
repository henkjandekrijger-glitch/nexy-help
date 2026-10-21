import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "Nexy · Vind je mensen", description: "Praat met Nexy. Vind je mensen. Anoniem voor elkaar, via AI.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { readonly children: ReactNode }) { return <html lang="nl"><body>{children}</body></html>; }

