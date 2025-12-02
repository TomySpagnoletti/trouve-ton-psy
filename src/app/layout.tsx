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
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon/favicon.ico"],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    title: "TTP",
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
