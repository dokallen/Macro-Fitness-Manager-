"use client";

import React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class OnboardingErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unexpected onboarding error.",
    };
  }

  componentDidCatch(error: Error) {
    console.error("Onboarding runtime error:", error);
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Onboarding hit a runtime error.</p>
            <p className="mt-2 break-words text-destructive/90">
              {this.state.message}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={this.reset}>
              Try again
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
