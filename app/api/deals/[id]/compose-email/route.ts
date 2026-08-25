import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrGenerateDealFollowUp, DealFollowUpError } from '@/lib/deal-followup'

// ── POST — compose follow-up content for a deal ──────────────────────────────
// Thin wrapper: authenticate, then delegate to the shared generator that also
// backs the per-salesperson report. Returns { subject, body, inspection }.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Optional { force: true } bypasses saved output for this deal
  const force = await req.json().then(b => b?.force === true).catch(() => false)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await getOrGenerateDealFollowUp(id, createAdminClient(), { force })
    return NextResponse.json({
      subject:     result.dealName,
      body:        result.body,
      inspection:  result.inspection,
      generatedAt: result.generatedAt,
    })
  } catch (err) {
    const status = err instanceof DealFollowUpError ? err.status : 502
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status })
  }
}
