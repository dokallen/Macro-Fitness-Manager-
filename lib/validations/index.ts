import { z } from "zod";

import { dobError, localCalendarDate } from "@/lib/profile/profile";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
    displayName: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const onboardingStep1Schema = z.object({
  displayName: z.string().min(1, "Display name is required."),
  goal: z
    .string()
    .refine(
      (value) => value.split(",").map((v) => v.trim()).filter(Boolean).length > 0,
      "Select at least one goal."
    ),
});

export const onboardingStep2Schema = z
  .object({
    currentWeight: z
      .number({ error: "Enter current weight." })
      .positive("Enter current weight."),
    currentWeightUnit: z.enum(["lbs", "kg"], { error: "Choose a unit." }),
    goalWeight: z
      .number({ error: "Enter goal weight." })
      .positive("Enter goal weight."),
    goalWeightUnit: z.enum(["lbs", "kg"], { error: "Choose a unit." }),
    // Date of birth is fully optional (Phase 2.5); checked together below.
    // Integer and range checks happen in dobError, so every message lands on birthYear.
    birthYear: z.number().optional(),
    birthMonth: z.number().optional(),
    birthDay: z.number().optional(),
    height: z.string().min(1, "Enter height."),
    biologicalSex: z.enum(["female", "male", "other"], {
      error: "Choose an option.",
    }),
    activityLevel: z.enum([
      "sedentary",
      "lightly active",
      "moderately active",
      "very active",
    ], { error: "Choose your activity level." }),
    primaryGoal: z.enum([
      "fat loss",
      "muscle gain",
      "maintenance",
      "body recomposition",
    ], { error: "Choose your primary goal." }),
    targets: z
      .array(
        z.object({
          key: z.string().min(1, "Key is required."),
          value: z.string().min(1, "Value is required."),
          unit: z.string().optional(),
        })
      )
      .min(1, "Generate or add at least one target."),
    aiExplanation: z.string().optional(),
    coachSummary: z.string().optional(),
    recommendedTimeframe: z.string().optional(),
    recommendedWorkoutFrequency: z.string().optional(),
    weeklyPlanSuggestion: z.string().optional(),
  })
  .refine(
    (data) => data.targets.some((t) => t.key.trim() && t.value.trim()),
    { message: "Provide at least one macro target.", path: ["targets"] }
  )
  .superRefine((data, ctx) => {
    const message = dobError(
      { year: data.birthYear, month: data.birthMonth, day: data.birthDay },
      localCalendarDate()
    );
    if (message) ctx.addIssue({ code: "custom", message, path: ["birthYear"] });
  });

export const onboardingStep3Schema = z
  .object({
    selectedMetrics: z.array(z.string()),
    customMetric: z.string().optional(),
  })
  .refine(
    (data) =>
      data.selectedMetrics.length > 0 || (data.customMetric ?? "").trim().length > 0,
    {
      message: "Pick at least one option or add something else.",
      path: ["selectedMetrics"],
    }
  )
  .refine(
    (data) =>
      data.selectedMetrics.every((metric) => typeof metric === "string" && metric.trim().length > 0),
    {
      message: "Invalid metric selection.",
      path: ["selectedMetrics"],
    }
  )
  .refine((data) => (data.customMetric ?? "").length <= 120, {
    message: "Anything else must be 120 characters or fewer.",
    path: ["customMetric"],
  });

export const onboardingStep4Schema = z.object({
  mealsPerDay: z.number().int().min(1).max(24),
  mealRotation: z.string().min(1, "Describe rotation preference."),
});

export const onboardingStep5Schema = z.object({
  cardioType: z.string().min(1, "Cardio type is required."),
  cardioFrequency: z.string().min(1, "Frequency is required."),
  cardioMetrics: z.array(z.object({ name: z.string() })),
});

export const onboardingStep6Schema = z
  .object({
    progressMetrics: z
      .array(z.object({ name: z.string() }))
      .min(1, "Add at least one metric row."),
  })
  .superRefine((data, ctx) => {
    const names = data.progressMetrics.map((m) => m.name.trim()).filter(Boolean);
    if (names.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one metric name.",
        path: ["progressMetrics", 0, "name"],
      });
    }
  });
