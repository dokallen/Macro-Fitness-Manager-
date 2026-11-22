import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GuestModeBanner } from "@/components/guest/GuestModeBanner";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SonnerToaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// DM Sans and Bebas Neue are self-hosted copies of the latin-subset files that
// Google Fonts serves, so next/font no longer downloads them during the build.
// Licenses: app/fonts/OFL-DMSans.txt and app/fonts/OFL-BebasNeue.txt.
const dmSans = localFont({
  src: "./fonts/DMSans-latin-wght.woff2",
  variable: "--font-sans",
  weight: "400 700",
});

const bebasNeue = localFont({
  src: "./fonts/BebasNeue-Regular-latin.woff2",
  variable: "--font-heading",
  weight: "400",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Macro Fit",
  description: "Your fitness and nutrition companion — fully personalized.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#080c12" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- required Google Fonts link per design spec */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={cn(
          dmSans.variable,
          bebasNeue.variable,
          geistMono.variable,
          "min-h-dvh bg-background font-sans text-foreground antialiased"
        )}
      >
        <GuestModeBanner />
        {children}
        <SonnerToaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
