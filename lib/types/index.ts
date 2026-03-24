export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          created_at: string;
          display_name: string;
          onboarding_complete: boolean;
        };
        Insert: {
          id: string;
          created_at?: string;
          display_name?: string;
          onboarding_complete?: boolean;
        };
        Update: {
          id?: string;
          created_at?: string;
          display_name?: string;
          onboarding_complete?: boolean;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: string;
          updated_at?: string;
          updated_by?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_splits: {
        Row: {
          id: string;
          user_id: string;
          day_number: number;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          day_number: number;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          day_number?: number;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_splits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          split_id: string | null;
          logged_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          split_id?: string | null;
          logged_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          split_id?: string | null;
          logged_at?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_split_id_fkey";
            columns: ["split_id"];
            isOneToOne: false;
            referencedRelation: "workout_splits";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sets: {
        Row: {
          id: string;
          session_id: string;
          exercise_name: string;
          sets: number;
          reps: number;
          weight: number | null;
          unit: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          exercise_name: string;
          sets: number;
          reps: number;
          weight?: number | null;
          unit?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          exercise_name?: string;
          sets?: number;
          reps?: number;
          weight?: number | null;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          instructions: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          instructions?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          instructions?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_macros: {
        Row: {
          id: string;
          recipe_id: string;
          key: string;
          value: number;
          unit: string;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          key: string;
          value: number;
          unit?: string;
        };
        Update: {
          id?: string;
          recipe_id?: string;
          key?: string;
          value?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_macros_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          rotation_frequency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          rotation_frequency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          rotation_frequency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plan_entries: {
        Row: {
          id: string;
          meal_plan_id: string;
          day: number;
          meal_number: number;
          recipe_id: string | null;
        };
        Insert: {
          id?: string;
          meal_plan_id: string;
          day: number;
          meal_number: number;
          recipe_id?: string | null;
        };
        Update: {
          id?: string;
          meal_plan_id?: string;
          day?: number;
          meal_number?: number;
          recipe_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_meal_plan_id_fkey";
            columns: ["meal_plan_id"];
            isOneToOne: false;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      food_logs: {
        Row: {
          id: string;
          user_id: string;
          logged_at: string;
          meal_number: number;
          food_name: string;
          quantity: number | null;
          unit: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          logged_at?: string;
          meal_number: number;
          food_name: string;
          quantity?: number | null;
          unit?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          logged_at?: string;
          meal_number?: number;
          food_name?: string;
          quantity?: number | null;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "food_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      food_log_macros: {
        Row: {
          id: string;
          food_log_id: string;
          key: string;
          value: number;
        };
        Insert: {
          id?: string;
          food_log_id: string;
          key: string;
          value: number;
        };
        Update: {
          id?: string;
          food_log_id?: string;
          key?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "food_log_macros_food_log_id_fkey";
            columns: ["food_log_id"];
            isOneToOne: false;
            referencedRelation: "food_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      progress_entries: {
        Row: {
          id: string;
          user_id: string;
          logged_at: string;
          metric_key: string;
          value: number;
          unit: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          logged_at?: string;
          metric_key: string;
          value: number;
          unit?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          logged_at?: string;
          metric_key?: string;
          value?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cardio_sessions: {
        Row: {
          id: string;
          user_id: string;
          logged_at: string;
          type: string;
          duration_minutes: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          logged_at?: string;
          type?: string;
          duration_minutes?: number | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          logged_at?: string;
          type?: string;
          duration_minutes?: number | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cardio_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      cardio_metrics: {
        Row: {
          id: string;
          cardio_session_id: string;
          key: string;
          value: number;
          unit: string;
        };
        Insert: {
          id?: string;
          cardio_session_id: string;
          key: string;
          value: number;
          unit?: string;
        };
        Update: {
          id?: string;
          cardio_session_id?: string;
          key?: string;
          value?: number;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cardio_metrics_cardio_session_id_fkey";
            columns: ["cardio_session_id"];
            isOneToOne: false;
            referencedRelation: "cardio_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      coach_messages: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coach_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
