import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { GuestModeBanner } from "@/components/guest/GuestModeBanner";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SonnerToaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
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
