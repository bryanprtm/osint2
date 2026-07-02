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
      app_modules: {
        Row: {
          category: string
          code: string
          created_at: string
          custom: boolean
          description: string
          enabled: boolean
          icon_key: string
          id: string
          input_label: string
          name: string
          placeholder: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          custom?: boolean
          description?: string
          enabled?: boolean
          icon_key?: string
          id: string
          input_label?: string
          name: string
          placeholder?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          custom?: boolean
          description?: string
          enabled?: boolean
          icon_key?: string
          id?: string
          input_label?: string
          name?: string
          placeholder?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          telegram_bot_token: string
          telegram_chat_id: string
          telegram_enabled: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          telegram_bot_token?: string
          telegram_chat_id?: string
          telegram_enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          telegram_bot_token?: string
          telegram_chat_id?: string
          telegram_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          id: string
          label: string
          password: string
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          password: string
          role?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          password?: string
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      wa_gateway_settings: {
        Row: {
          api_token: string
          bot_number: string
          commands: Json
          enabled: boolean
          id: number
          provider: string
          secret_key: string
          subdomain: string
          updated_at: string
        }
        Insert: {
          api_token?: string
          bot_number?: string
          commands?: Json
          enabled?: boolean
          id?: number
          provider?: string
          secret_key?: string
          subdomain?: string
          updated_at?: string
        }
        Update: {
          api_token?: string
          bot_number?: string
          commands?: Json
          enabled?: boolean
          id?: number
          provider?: string
          secret_key?: string
          subdomain?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_incoming: {
        Row: {
          created_at: string
          id: string
          matched_log_id: string | null
          message: string
          raw: Json | null
          sender: string
        }
        Insert: {
          created_at?: string
          id?: string
          matched_log_id?: string | null
          message?: string
          raw?: Json | null
          sender?: string
        }
        Update: {
          created_at?: string
          id?: string
          matched_log_id?: string | null
          message?: string
          raw?: Json | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_incoming_matched_log_id_fkey"
            columns: ["matched_log_id"]
            isOneToOne: false
            referencedRelation: "wa_send_log"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_send_log: {
        Row: {
          command_sent: string
          created_at: string
          error: string | null
          feature_id: string
          id: string
          provider: string
          provider_response: string | null
          query: string
          reply: string | null
          reply_at: string | null
          reply_sender: string | null
          status: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          command_sent: string
          created_at?: string
          error?: string | null
          feature_id: string
          id?: string
          provider?: string
          provider_response?: string | null
          query: string
          reply?: string | null
          reply_at?: string | null
          reply_sender?: string | null
          status?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          command_sent?: string
          created_at?: string
          error?: string | null
          feature_id?: string
          id?: string
          provider?: string
          provider_response?: string | null
          query?: string
          reply?: string | null
          reply_at?: string | null
          reply_sender?: string | null
          status?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
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
