"use client";

import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
};

export function SubpageHeader({ title, subtitle, backHref = "/" }: Props) {
  return (
    <header className="ph">
      <Link href={backHref} className="back-btn">
        ← Back
      </Link>
      <h1 className="pt">{title}</h1>
      {subtitle ? <p className="ps">{subtitle}</p> : null}
    </header>
  );
}
