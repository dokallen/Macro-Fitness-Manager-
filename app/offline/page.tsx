import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <h1 className="page-title text-3xl">You are offline</h1>
      <p className="max-w-sm font-sans text-sm text-muted-foreground">
        Check your connection and try again. Saved pages may still open from cache.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Go home
      </Link>
    </div>
  );
}
