export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      cardio_metrics: {
        Row: {
          cardio_session_id: string
          id: string
          key: string
          unit: string
          value: number
        }
        Insert: {
          cardio_session_id: string
          id?: string
          key: string
          unit?: string
          value: number
        }
        Update: {
          cardio_session_id?: string
          id?: string
          key?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "cardio_metrics_cardio_session_id_fkey"
            columns: ["cardio_session_id"]
            isOneToOne: false
            referencedRelation: "cardio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cardio_sessions: {
        Row: {
          duration_minutes: number | null
          id: string
          logged_at: string
          notes: string | null
          type: string
          user_id: string
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          logged_at?: string
          notes?: string | null
          type?: string
          user_id: string
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          logged_at?: string
          notes?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_conversations: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_id?: string
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      food_log_macros: {
        Row: {
          food_log_id: string
          id: string
          key: string
          value: number
        }
        Insert: {
          food_log_id: string
          id?: string
          key: string
          value: number
        }
        Update: {
          food_log_id?: string
          id?: string
          key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_log_macros_food_log_id_fkey"
            columns: ["food_log_id"]
            isOneToOne: false
            referencedRelation: "food_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      food_logs: {
        Row: {
          food_name: string
          id: string
          logged_at: string
          meal_number: number
          quantity: number | null
          unit: string
          user_id: string
        }
        Insert: {
          food_name: string
          id?: string
          logged_at?: string
          meal_number: number
          quantity?: number | null
          unit?: string
          user_id: string
        }
        Update: {
          food_name?: string
          id?: string
          logged_at?: string
          meal_number?: number
          quantity?: number | null
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          day: number
          id: string
          meal_number: number
          meal_plan_id: string
          recipe_id: string | null
        }
        Insert: {
          day: number
          id?: string
          meal_number: number
          meal_plan_id: string
          recipe_id?: string | null
        }
        Update: {
          day?: number
          id?: string
          meal_number?: number
          meal_plan_id?: string
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          id: string
          rotation_frequency: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          rotation_frequency?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          rotation_frequency?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_entries: {
        Row: {
          id: string
          logged_at: string
          metric_key: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          id?: string
          logged_at?: string
          metric_key: string
          unit?: string
          user_id: string
          value: number
        }
        Update: {
          id?: string
          logged_at?: string
          metric_key?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "progress_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_macros: {
        Row: {
          id: string
          key: string
          recipe_id: string
          unit: string
          value: number
        }
        Insert: {
          id?: string
          key: string
          recipe_id: string
          unit?: string
          value: number
        }
        Update: {
          id?: string
          key?: string
          recipe_id?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_macros_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          instructions: string[]
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string[]
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string[]
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string
          user_id: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string
          user_id: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string
          id: string
          onboarding_complete: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          onboarding_complete?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          onboarding_complete?: boolean
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          id: string
          logged_at: string
          notes: string | null
          split_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          logged_at?: string
          notes?: string | null
          split_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          logged_at?: string
          notes?: string | null
          split_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "workout_splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          exercise_name: string
          id: string
          reps: number
          session_id: string
          sets: number
          unit: string
          weight: number | null
        }
        Insert: {
          exercise_name: string
          id?: string
          reps: number
          session_id: string
          sets: number
          unit?: string
          weight?: number | null
        }
        Update: {
          exercise_name?: string
          id?: string
          reps?: number
          session_id?: string
          sets?: number
          unit?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_splits: {
        Row: {
          created_at: string
          day_number: number
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
