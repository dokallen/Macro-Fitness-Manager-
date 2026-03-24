import { Sparkles } from "lucide-react";

type Props = {
  tip: string | null;
  /** When true and tip is null, show API/key troubleshooting copy. */
  errorFallback?: boolean;
};

export function CoachTipCard({ tip, errorFallback }: Props) {
  const body =
    tip ??
    (errorFallback
      ? "Tip unavailable right now. Check that ANTHROPIC_API_KEY is set on the server."
      : "Your coach tip will appear here once generated.");

  return (
    <section
      className="rounded-xl border border-primary/25 bg-primary/5 p-5 shadow-sm"
      aria-labelledby="coach-tip-heading"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" aria-hidden />
        <h2 id="coach-tip-heading" className="text-lg font-semibold text-foreground">
          Coach tip
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{body}</p>
    </section>
  );
}
