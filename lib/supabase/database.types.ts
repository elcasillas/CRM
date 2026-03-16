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
      contact_roles: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          role_type: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          role_type: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          role_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_roles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
          entity_name: string | null
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
          entity_name?: string | null
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
          entity_name?: string | null
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
          ai_summary: string | null
          ai_summary_generated_at: string | null
          amount: number | null
          close_date: string | null
          contract_term_months: number | null
          created_at: string
          currency: string
          deal_description: string | null
          deal_name: string
          deal_owner_id: string
          deal_type: string | null
          health_debug: Json | null
          health_score: number | null
          hs_activity_recency: number | null
          hs_acv: number | null
          hs_close_date: number | null
          hs_notes_signal: number | null
          hs_stage_probability: number | null
          hs_velocity: number | null
          id: string
          inspection_result: Json | null
          inspection_run_at: string | null
          inspection_score: number | null
          last_activity_at: string | null
          notes_hash: string | null
          region: string | null
          solutions_engineer_id: string | null
          stage_id: string
          total_contract_value: number | null
          updated_at: string
          value_amount: number | null
        }
        Insert: {
          account_id: string
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          amount?: number | null
          close_date?: string | null
          contract_term_months?: number | null
          created_at?: string
          currency?: string
          deal_description?: string | null
          deal_name: string
          deal_owner_id: string
          deal_type?: string | null
          health_debug?: Json | null
          health_score?: number | null
          hs_activity_recency?: number | null
          hs_acv?: number | null
          hs_close_date?: number | null
          hs_notes_signal?: number | null
          hs_stage_probability?: number | null
          hs_velocity?: number | null
          id?: string
          inspection_result?: Json | null
          inspection_run_at?: string | null
          inspection_score?: number | null
          last_activity_at?: string | null
          notes_hash?: string | null
          region?: string | null
          solutions_engineer_id?: string | null
          stage_id: string
          total_contract_value?: number | null
          updated_at?: string
          value_amount?: number | null
        }
        Update: {
          account_id?: string
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          amount?: number | null
          close_date?: string | null
          contract_term_months?: number | null
          created_at?: string
          currency?: string
          deal_description?: string | null
          deal_name?: string
          deal_owner_id?: string
          deal_type?: string | null
          health_debug?: Json | null
          health_score?: number | null
          hs_activity_recency?: number | null
          hs_acv?: number | null
          hs_close_date?: number | null
          hs_notes_signal?: number | null
          hs_stage_probability?: number | null
          hs_velocity?: number | null
          id?: string
          inspection_result?: Json | null
          inspection_run_at?: string | null
          inspection_score?: number | null
          last_activity_at?: string | null
          notes_hash?: string | null
          region?: string | null
          solutions_engineer_id?: string | null
          stage_id?: string
          total_contract_value?: number | null
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
      inspection_config: {
        Row: {
          checks: Json
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          checks?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          checks?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
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
      partner_ai_summaries: {
        Row: {
          created_at: string
          executive_summary: string | null
          generated_at: string
          growth_summary: string | null
          id: string
          metrics_hash: string
          model: string
          outreach_email_body: string | null
          outreach_email_subject: string | null
          partner_id: string
          qbr_talking_points: Json | null
          recommended_actions: Json | null
          risk_summary: string | null
        }
        Insert: {
          created_at?: string
          executive_summary?: string | null
          generated_at?: string
          growth_summary?: string | null
          id?: string
          metrics_hash: string
          model: string
          outreach_email_body?: string | null
          outreach_email_subject?: string | null
          partner_id: string
          qbr_talking_points?: Json | null
          recommended_actions?: Json | null
          risk_summary?: string | null
        }
        Update: {
          created_at?: string
          executive_summary?: string | null
          generated_at?: string
          growth_summary?: string | null
          id?: string
          metrics_hash?: string
          model?: string
          outreach_email_body?: string | null
          outreach_email_subject?: string | null
          partner_id?: string
          qbr_talking_points?: Json | null
          recommended_actions?: Json | null
          risk_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_ai_summaries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_health_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_active: boolean
          message: string
          partner_id: string
          resolved_at: string | null
          severity: string
          triggered_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          partner_id: string
          resolved_at?: string | null
          severity: string
          triggered_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          partner_id?: string
          resolved_at?: string | null
          severity?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_health_alerts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_health_config: {
        Row: {
          category_weights: Json
          id: string
          model_version: string
          stale_days: number
          thresholds: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category_weights?: Json
          id?: string
          model_version?: string
          stale_days?: number
          thresholds?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category_weights?: Json
          id?: string
          model_version?: string
          stale_days?: number
          thresholds?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      partner_health_scores: {
        Row: {
          category_scores: Json | null
          computed_at: string
          confidence_score: number | null
          created_at: string
          growth_score: number | null
          health_status: string | null
          id: string
          model_version: string
          overall_score: number | null
          partner_id: string
          risk_score: number | null
          score_debug: Json | null
        }
        Insert: {
          category_scores?: Json | null
          computed_at?: string
          confidence_score?: number | null
          created_at?: string
          growth_score?: number | null
          health_status?: string | null
          id?: string
          model_version?: string
          overall_score?: number | null
          partner_id: string
          risk_score?: number | null
          score_debug?: Json | null
        }
        Update: {
          category_scores?: Json | null
          computed_at?: string
          confidence_score?: number | null
          created_at?: string
          growth_score?: number | null
          health_status?: string | null
          id?: string
          model_version?: string
          overall_score?: number | null
          partner_id?: string
          risk_score?: number | null
          score_debug?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_health_scores_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_health_snapshots: {
        Row: {
          category_scores: Json | null
          created_at: string
          id: string
          metric_summary: Json | null
          overall_score: number | null
          partner_id: string
          snapshot_month: string
        }
        Insert: {
          category_scores?: Json | null
          created_at?: string
          id?: string
          metric_summary?: Json | null
          overall_score?: number | null
          partner_id: string
          snapshot_month: string
        }
        Update: {
          category_scores?: Json | null
          created_at?: string
          id?: string
          metric_summary?: Json | null
          overall_score?: number | null
          partner_id?: string
          snapshot_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_health_snapshots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_metrics: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          metric_date: string
          metric_key: string
          metric_value: number | null
          notes: string | null
          partner_id: string
          source: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric_date: string
          metric_key: string
          metric_value?: number | null
          notes?: string | null
          partner_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metric_date?: string
          metric_key?: string
          metric_value?: number | null
          notes?: string | null
          partner_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_metrics_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          account_id: string | null
          account_manager_id: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          partner_name: string
          partner_type: string
          region: string | null
          status: string
          tier: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_id?: string | null
          account_manager_id?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          partner_name: string
          partner_type: string
          region?: string | null
          status?: string
          tier?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_id?: string | null
          account_manager_id?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          partner_name?: string
          partner_type?: string
          region?: string | null
          status?: string
          tier?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_account_manager_id_fkey"
            columns: ["account_manager_id"]
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
      can_view_partner: {
        Args: { p_id: string; uid: string }
        Returns: boolean
      }
      evaluate_partner_alerts: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      get_deals_page: {
        Args: {
          p_active_only?: boolean
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
          amount: number
          close_date: string
          contract_term_months: number
          created_at: string
          currency: string
          deal_description: string
          deal_name: string
          deal_owner_id: string
          deal_owner_name: string
          deal_type: string
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
          region: string
          se_name: string
          solutions_engineer_id: string
          stage_id: string
          stage_is_closed: boolean
          stage_is_lost: boolean
          stage_is_won: boolean
          stage_name: string
          stage_sort_order: number
          total_contract_value: number
          updated_at: string
          value_amount: number
        }[]
      }
      get_partners_page: {
        Args: {
          p_owner_id?: string
          p_search?: string
          p_status?: string
          p_tier?: string
          p_type?: string
        }
        Returns: {
          account_id: string
          account_manager_id: string
          account_manager_name: string
          account_name: string
          active_alert_count: number
          category_scores: Json
          computed_at: string
          confidence_score: number
          country: string
          created_at: string
          days_since_last_note: number
          description: string
          growth_score: number
          health_status: string
          id: string
          overall_score: number
          partner_name: string
          partner_type: string
          region: string
          risk_score: number
          score_delta_3mo: number
          status: string
          tier: string
          top_alert_severity: string
          updated_at: string
          website: string
        }[]
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      recompute_all_deal_health_scores: { Args: never; Returns: number }
      recompute_all_partner_health_scores: { Args: never; Returns: number }
      recompute_deal_health_score: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      recompute_partner_health_score: {
        Args: { p_partner_id: string }
        Returns: undefined
      }
      snapshot_all_partner_health: { Args: never; Returns: number }
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
