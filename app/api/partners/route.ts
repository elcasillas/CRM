import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_name, tier, status, region')
    .order('partner_name')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
