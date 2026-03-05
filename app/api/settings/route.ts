import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/settings — returns non-sensitive app settings for all authenticated users
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('health_score_config')
    .select('stale_days')
    .limit(1)
    .single()

  return NextResponse.json({ stale_days: data?.stale_days ?? 30 })
}
