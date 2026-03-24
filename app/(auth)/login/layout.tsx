import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Macro Fit",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
