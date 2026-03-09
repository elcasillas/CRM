import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateSummary } from '@/lib/deal-summarize'

// ── GET — return stored summary from deals table ─────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('deals')
    .select('ai_summary, ai_summary_generated_at')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  return NextResponse.json({
    summary: data.ai_summary ?? null,
    generatedAt: data.ai_summary_generated_at ?? null,
  })
}

// ── POST — generate (or return cached) summary, persist to deals ─────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  let result: Awaited<ReturnType<typeof getOrCreateSummary>>
  try {
    result = await getOrCreateSummary(id, admin)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  if (!result) return NextResponse.json({ error: 'Deal not found or no notes to summarize' }, { status: 400 })

  return NextResponse.json({
    summary: result.summary,
    cached: !result.isNew,
    generatedAt: result.generatedAt,
  })
}
