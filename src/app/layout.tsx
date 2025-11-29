import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trouve Ton Psy | Annuaire psychologues conventionnés Mon Soutien Psy",
  description: "Recherchez rapidement un psychologue Mon Soutien Psy par ville, spécialité, public et téléconsultation.",
  keywords: ["psychologue", "Mon Soutien Psy", "annuaire", "spécialités", "téléconsultation", "santé mentale"],
  openGraph: {
    title: "Trouve Ton Psy",
    description: "Le moteur de recherche simple et rapide des psychologues conventionnés.",
    url: "https://trouvetonpsy.xyz",
    siteName: "Trouve Ton Psy",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
