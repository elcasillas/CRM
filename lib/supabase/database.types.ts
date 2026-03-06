Initialising login role...
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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_name: string
          account_owner_id: string
          account_website: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          postal: string | null
          region: string | null
          service_manager_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_name: string
          account_owner_id: string
          account_website?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          postal?: string | null
          region?: string | null
          service_manager_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_owner_id?: string
          account_website?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          postal?: string | null
          region?: string | null
          service_manager_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_account_owner_id_fkey"
            columns: ["account_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_service_manager_id_fkey"
            columns: ["service_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_primary: boolean
          last_name: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          account_id: string
          auto_renew: boolean
          created_at: string
          effective_date: string | null
          id: string
          renewal_date: string | null
          renewal_term_months: number | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_renew?: boolean
          created_at?: string
          effective_date?: string | null
          id?: string
          renewal_date?: string | null
          renewal_term_months?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_renew?: boolean
          created_at?: string
          effective_date?: string | null
          id?: string
          renewal_date?: string | null
          renewal_term_months?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_history: {
        Row: {
          changed_at: string
          changed_by: string
          deal_id: string
          from_stage_id: string | null
          id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          deal_id: string
          from_stage_id?: string | null
          id?: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          deal_id?: string
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          created_at: string
          id: string
          is_closed: boolean
          is_lost: boolean
          is_won: boolean
          sort_order: number
          stage_name: string
          updated_at: string
          win_probability: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_closed?: boolean
          is_lost?: boolean
          is_won?: boolean
          sort_order: number
          stage_name: string
          updated_at?: string
          win_probability?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_closed?: boolean
          is_lost?: boolean
          is_won?: boolean
          sort_order?: number
          stage_name?: string
          updated_at?: string
          win_probability?: number | null
        }
        Relationships: []
      }
      deal_summary_cache: {
        Row: {
          created_at: string
          deal_id: string
          model: string
          notes_hash: string
          summary: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          model?: string
          notes_hash: string
          summary: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          model?: string
          notes_hash?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_summary_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          account_id: string
          close_date: string | null
          created_at: string
          currency: string
          deal_description: string | null
          deal_name: string
          deal_owner_id: string
          health_debug: Json | null
          health_score: number | null
          hs_activity_recency: number | null
          hs_acv: number | null
          hs_close_date: number | null
          hs_notes_signal: number | null
          hs_stage_probability: number | null
          hs_velocity: number | null
          id: string
          last_activity_at: string | null
          notes_hash: string | null
          solutions_engineer_id: string | null
          stage_id: string
          updated_at: string
          value_amount: number | null
        }
        Insert: {
          account_id: string
          close_date?: string | null
          created_at?: string
          currency?: string
          deal_description?: string | null
          deal_name: string
          deal_owner_id: string
          health_debug?: Json | null
          health_score?: number | null
          hs_activity_recency?: number | null
          hs_acv?: number | null
          hs_close_date?: number | null
          hs_notes_signal?: number | null
          hs_stage_probability?: number | null
          hs_velocity?: number | null
          id?: string
          last_activity_at?: string | null
          notes_hash?: string | null
          solutions_engineer_id?: string | null
          stage_id: string
          updated_at?: string
          value_amount?: number | null
        }
        Update: {
          account_id?: string
          close_date?: string | null
          created_at?: string
          currency?: string
          deal_description?: string | null
          deal_name?: string
          deal_owner_id?: string
          health_debug?: Json | null
          health_score?: number | null
          hs_activity_recency?: number | null
          hs_acv?: number | null
          hs_close_date?: number | null
          hs_notes_signal?: number | null
          hs_stage_probability?: number | null
          hs_velocity?: number | null
          id?: string
          last_activity_at?: string | null
          notes_hash?: string | null
          solutions_engineer_id?: string | null
          stage_id?: string
          updated_at?: string
          value_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_deal_owner_id_fkey"
            columns: ["deal_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_solutions_engineer_id_fkey"
            columns: ["solutions_engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      health_score_config: {
        Row: {
          id: string
          keywords: Json
          new_deal_days: number
          stale_days: number
          updated_at: string | null
          updated_by: string | null
          weights: Json
        }
        Insert: {
          id?: string
          keywords?: Json
          new_deal_days?: number
          stale_days?: number
          updated_at?: string | null
          updated_by?: string | null
          weights?: Json
        }
        Update: {
          id?: string
          keywords?: Json
          new_deal_days?: number
          stale_days?: number
          updated_at?: string | null
          updated_by?: string | null
          weights?: Json
        }
        Relationships: []
      }
      hid_records: {
        Row: {
          account_id: string
          cluster_id: string | null
          created_at: string
          dc_location: string | null
          domain_name: string | null
          hid_number: string
          id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cluster_id?: string | null
          created_at?: string
          dc_location?: string | null
          domain_name?: string | null
          hid_number: string
          id?: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cluster_id?: string | null
          created_at?: string
          dc_location?: string | null
          domain_name?: string | null
          hid_number?: string
          id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hid_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          note_text: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          id?: string
          note_text: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
          slack_member_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          slack_member_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          slack_member_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_account: {
        Args: { acct_id: string; uid: string }
        Returns: boolean
      }
      can_view_note_entity: {
        Args: { eid: string; etype: string; uid: string }
        Returns: boolean
      }
      get_deals_page: {
        Args: {
          p_overdue_only?: boolean
          p_owner_id?: string
          p_search?: string
          p_stage_id?: string
          p_stale_days?: number
          p_stale_only?: boolean
        }
        Returns: {
          account_id: string
          account_name: string
          close_date: string
          created_at: string
          currency: string
          deal_description: string
          deal_name: string
          deal_owner_id: string
          deal_owner_name: string
          health_debug: Json
          health_score: number
          hs_activity_recency: number
          hs_acv: number
          hs_close_date: number
          hs_notes_signal: number
          hs_stage_probability: number
          hs_velocity: number
          id: string
          is_overdue: boolean
          is_stale: boolean
          last_activity_at: string
          last_note_at: string
          notes_hash: string
          se_name: string
          solutions_engineer_id: string
          stage_id: string
          stage_is_closed: boolean
          stage_is_lost: boolean
          stage_is_won: boolean
          stage_name: string
          stage_sort_order: number
          updated_at: string
          value_amount: number
        }[]
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      recompute_all_deal_health_scores: { Args: never; Returns: number }
      recompute_deal_health_score: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
