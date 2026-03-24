import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up — Macro Fit",
};

export default function SignupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
