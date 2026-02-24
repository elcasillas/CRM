// ── Profiles ────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'sales' | 'service_manager' | 'read_only'

export interface Profile {
  id:         string
  full_name:  string | null
  role:       UserRole
  created_at: string
  updated_at: string
}

// ── Accounts ────────────────────────────────────────────────────────────────
export interface Account {
  id:                 string
  account_name:       string
  account_website:    string | null
  address_line1:      string | null
  address_line2:      string | null
  city:               string | null
  region:             string | null
  postal:             string | null
  country:            string | null
  account_owner_id:   string
  service_manager_id: string | null
  status:             string
  description:        string | null
  created_at:         string
  updated_at:         string
}

export interface AccountWithOwners extends Account {
  account_owner:   { id: string; full_name: string | null } | null
  service_manager: { id: string; full_name: string | null } | null
}

// ── Contacts ────────────────────────────────────────────────────────────────
export interface Contact {
  id:         string
  account_id: string
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  title:      string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

// ── HID Records ─────────────────────────────────────────────────────────────
export interface HidRecord {
  id:          string
  account_id:  string
  hid_number:  string
  dc_location: string | null
  cluster_id:  string | null
  start_date:  string | null
  domain_name: string | null
  created_at:  string
  updated_at:  string
}

// ── Contracts ───────────────────────────────────────────────────────────────
export interface Contract {
  id:                  string
  account_id:          string
  effective_date:      string | null
  renewal_date:        string | null
  renewal_term_months: number | null
  auto_renew:          boolean
  status:              string
  created_at:          string
  updated_at:          string
}

// ── Deal Stages ─────────────────────────────────────────────────────────────
export interface DealStage {
  id:         string
  stage_name: string
  sort_order: number
  is_closed:  boolean
  is_won:     boolean
  is_lost:    boolean
}

// ── Deals ───────────────────────────────────────────────────────────────────
export interface Deal {
  id:               string
  account_id:       string
  stage_id:         string
  deal_name:        string
  deal_description: string | null
  deal_notes:       string | null
  deal_owner_id:          string
  solutions_engineer_id:  string | null
  value_amount:           number | null
  currency:               string
  close_date:             string | null
  last_activity_at:       string | null
  created_at:             string
  updated_at:             string
}

export interface DealWithRelations extends Deal {
  accounts:             { account_name: string } | null
  deal_stages:          Pick<DealStage, 'stage_name' | 'sort_order' | 'is_closed' | 'is_won' | 'is_lost'> | null
  deal_owner:           { full_name: string | null } | null
  solutions_engineer:   { full_name: string | null } | null
}

// ── Notes ───────────────────────────────────────────────────────────────────
export type NoteEntityType = 'account' | 'deal' | 'contact' | 'contract' | 'hid'

export interface Note {
  id:          string
  entity_type: NoteEntityType
  entity_id:   string
  note_text:   string
  created_by:  string
  created_at:  string
}

export interface NoteWithAuthor extends Note {
  author: { full_name: string | null } | null
}

// ── Joined / view types ──────────────────────────────────────────────────────

export interface ContractWithAccount extends Contract {
  accounts: { account_name: string } | null
}
