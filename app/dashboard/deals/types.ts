import type { Account, DealStage, DealWithRelations } from '@/lib/types'
import type { Database } from '@/lib/supabase/database.types'

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

export type DealPageRow = Database['public']['Functions']['get_deals_page']['Returns'][0]

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
