import type { Account, DealStage, DealWithRelations } from '@/lib/types'

export type DealFormData = {
  deal_name:             string
  deal_description:      string
  account_id:            string
  stage_id:              string
  deal_owner_id:         string
  solutions_engineer_id: string
  value_amount:          string
  currency:              string
  close_date:            string
}

export type ProfileRow = {
  id:              string
  full_name:       string | null
  role:            string
  slack_member_id: string | null
}

export type DealPageRow = {
  // deal core
  id:                    string
  deal_name:             string
  deal_description:      string | null
  account_id:            string
  stage_id:              string
  deal_owner_id:         string
  solutions_engineer_id: string | null
  value_amount:          number | null
  currency:              string
  close_date:            string | null
  last_activity_at:      string | null
  created_at:            string
  updated_at:            string
  health_score:          number | null
  hs_stage_probability:  number | null
  hs_velocity:           number | null
  hs_activity_recency:   number | null
  hs_close_date:         number | null
  hs_acv:                number | null
  hs_notes_signal:       number | null
  health_debug:          Record<string, unknown> | null
  notes_hash:            string | null
  // joined
  account_name:     string | null
  stage_name:       string | null
  stage_sort_order: number | null
  stage_is_closed:  boolean | null
  stage_is_won:     boolean | null
  stage_is_lost:    boolean | null
  deal_owner_name:  string | null
  se_name:          string | null
  // derived
  last_note_at: string | null
  is_stale:     boolean
  is_overdue:   boolean
}

export type DealsInitialData = {
  deals:           DealWithRelations[]
  stages:          DealStage[]
  accounts:        Pick<Account, 'id' | 'account_name'>[]
  profiles:        ProfileRow[]
  lastNoteDates:   Record<string, string>
  emailMap:        Record<string, string>
  staleDays:       number
  currentUserId:   string
  currentUserRole: string
}
