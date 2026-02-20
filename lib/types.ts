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
