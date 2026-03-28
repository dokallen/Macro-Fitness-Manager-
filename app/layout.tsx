import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GuestModeBanner } from "@/components/guest/GuestModeBanner";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { SonnerToaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090b" />
      </head>
      <body
        className={cn(
          geistSans.variable,
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
