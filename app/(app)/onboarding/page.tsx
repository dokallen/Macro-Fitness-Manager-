import { OnboardingErrorBoundary } from "@/components/onboarding/OnboardingErrorBoundary";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <OnboardingErrorBoundary>
      <OnboardingWizard />
    </OnboardingErrorBoundary>
  );
}
