import type { Tables } from './supabase/database.types'

// ── Semantic union types ──────────────────────────────────────────────────────
// Postgres CHECK constraints don't generate TS enums, so we keep these.

export type UserRole =
  | 'admin'
  | 'sales'
  | 'sales_manager'
  | 'solutions_engineer'
  | 'service_manager'
  | 'read_only'

export type NoteEntityType = 'account' | 'deal' | 'contact' | 'contract' | 'hid' | 'partner'

// ── Table row types (generated aliases) ──────────────────────────────────────
// Replace manual interface declarations — regenerate with `npm run gen-types`.

export type Account     = Tables<'accounts'>
export type Contact     = Tables<'contacts'>
export type ContactRole = Tables<'contact_roles'>
export type HidRecord   = Tables<'hid_records'>
export type Contract    = Tables<'contracts'>
export type DealStage   = Tables<'deal_stages'>
export type Deal        = Tables<'deals'>

export type ContactRoleType = 'primary' | 'billing' | 'marketing' | 'support' | 'technical'

// Note and Profile override the generated `string` types for constrained columns
// with narrower union types for better type safety.
export type Note    = Omit<Tables<'notes'>,    'entity_type'> & { entity_type: NoteEntityType }
export type Profile = Omit<Tables<'profiles'>, 'role'>        & { role: UserRole }

// ── Relational types (joins — cannot come from generated table types) ─────────

export interface DealWithRelations extends Deal {
  accounts:           { account_name: string } | null
  deal_stages:        Pick<DealStage, 'stage_name' | 'sort_order' | 'is_closed' | 'is_won' | 'is_lost'> | null
  deal_owner:         { full_name: string | null } | null
  solutions_engineer: { full_name: string | null } | null
}

export interface ContactWithRoles extends Contact {
  contact_roles: { role_type: string }[]
}

export interface AccountWithOwners extends Account {
  account_owner:   { id: string; full_name: string | null } | null
  service_manager: { id: string; full_name: string | null } | null
}

export interface NoteWithAuthor extends Note {
  author: { full_name: string | null } | null
}

export interface ContractWithAccount extends Contract {
  accounts: { account_name: string } | null
}
