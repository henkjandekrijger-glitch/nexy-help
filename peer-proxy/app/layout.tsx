import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = { title: "Samen · Menselijk contact via AI", description: "Praat. Vind elkaar. Anoniem voor elkaar, met AI die filtert en matcht.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { readonly children: ReactNode }) { return <html lang="nl"><body>{children}</body></html>; }

