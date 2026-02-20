export type ContactStatus = 'lead' | 'prospect' | 'customer' | 'churned'

export interface Contact {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  status: ContactStatus
  notes: string | null
  created_at: string
}

export type DealStage = 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'

export interface Deal {
  id: string
  user_id: string
  contact_id: string | null
  title: string
  stage: DealStage
  value: number | null
  expected_close: string | null
  notes: string | null
  created_at: string
}

export interface DealWithContact extends Deal {
  contacts: { name: string } | null
}

export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'other'

export interface Interaction {
  id: string
  user_id: string
  contact_id: string
  type: InteractionType
  occurred_at: string
  notes: string | null
  created_at: string
}
