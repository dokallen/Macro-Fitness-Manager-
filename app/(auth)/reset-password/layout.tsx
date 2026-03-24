import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set new password — Macro Fit",
};

export default function ResetPasswordLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
