import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onboarding — Macro Fit",
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
