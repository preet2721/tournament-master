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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      matches: {
        Row: {
          bracket_slot: string | null
          created_at: string
          id: string
          match_number: number
          participant1_id: string | null
          participant2_id: string | null
          round_number: number
          scheduled_at: string | null
          score1: number
          score2: number
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at: string
          winner_participant_id: string | null
        }
        Insert: {
          bracket_slot?: string | null
          created_at?: string
          id?: string
          match_number?: number
          participant1_id?: string | null
          participant2_id?: string | null
          round_number?: number
          scheduled_at?: string | null
          score1?: number
          score2?: number
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at?: string
          winner_participant_id?: string | null
        }
        Update: {
          bracket_slot?: string | null
          created_at?: string
          id?: string
          match_number?: number
          participant1_id?: string | null
          participant2_id?: string | null
          round_number?: number
          scheduled_at?: string | null
          score1?: number
          score2?: number
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id?: string
          updated_at?: string
          winner_participant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_participant_id_fkey"
            columns: ["winner_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          created_at: string
          draws: number
          id: string
          logo_url: string | null
          losses: number
          name: string
          points: number
          score_against: number
          score_for: number
          seed: number
          team_name: string | null
          tournament_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          created_at?: string
          draws?: number
          id?: string
          logo_url?: string | null
          losses?: number
          name: string
          points?: number
          score_against?: number
          score_for?: number
          seed?: number
          team_name?: string | null
          tournament_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          created_at?: string
          draws?: number
          id?: string
          logo_url?: string | null
          losses?: number
          name?: string
          points?: number
          score_against?: number
          score_for?: number
          seed?: number
          team_name?: string | null
          tournament_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          champion_participant_id: string | null
          created_at: string
          format: Database["public"]["Enums"]["tournament_format"]
          game_type: string
          id: string
          is_public: boolean
          match_duration_minutes: number
          name: string
          owner_id: string
          participant_target: number
          status: Database["public"]["Enums"]["tournament_status"]
          tournament_code: string
          updated_at: string
        }
        Insert: {
          champion_participant_id?: string | null
          created_at?: string
          format: Database["public"]["Enums"]["tournament_format"]
          game_type: string
          id?: string
          is_public?: boolean
          match_duration_minutes?: number
          name: string
          owner_id?: string
          participant_target?: number
          status?: Database["public"]["Enums"]["tournament_status"]
          tournament_code?: string
          updated_at?: string
        }
        Update: {
          champion_participant_id?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["tournament_format"]
          game_type?: string
          id?: string
          is_public?: boolean
          match_duration_minutes?: number
          name?: string
          owner_id?: string
          participant_target?: number
          status?: Database["public"]["Enums"]["tournament_status"]
          tournament_code?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_tournament: { Args: { _tournament_id: string }; Returns: boolean }
    }
    Enums: {
      match_status: "Scheduled" | "Live" | "Completed"
      tournament_format: "Knockout" | "Round Robin"
      tournament_status: "Draft" | "Live" | "Completed"
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
    Enums: {
      match_status: ["Scheduled", "Live", "Completed"],
      tournament_format: ["Knockout", "Round Robin"],
      tournament_status: ["Draft", "Live", "Completed"],
    },
  },
} as const
