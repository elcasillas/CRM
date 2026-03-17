import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api-helpers'

// GET /api/admin/dc-cluster-mappings — list all mappings (active + inactive)
export async function GET() {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('dc_cluster_mappings')
    .select('id, dc_location, cluster_id, is_active, updated_at')
    .order('dc_location')
    .order('cluster_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/dc-cluster-mappings — create a new mapping
export async function POST(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { dc_location, cluster_id } = await request.json()

  if (!dc_location?.trim() || !cluster_id?.trim()) {
    return NextResponse.json({ error: 'DC Location and Cluster ID are required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check for duplicate
  const { data: existing } = await admin
    .from('dc_cluster_mappings')
    .select('id')
    .eq('dc_location', dc_location.trim().toUpperCase())
    .eq('cluster_id', cluster_id.trim().toLowerCase())
    .single()

  if (existing) {
    return NextResponse.json({ error: `Mapping ${dc_location.trim().toUpperCase()} / ${cluster_id.trim().toLowerCase()} already exists.` }, { status: 409 })
  }

  const { data, error } = await admin
    .from('dc_cluster_mappings')
    .insert({ dc_location: dc_location.trim().toUpperCase(), cluster_id: cluster_id.trim().toLowerCase(), is_active: true })
    .select('id, dc_location, cluster_id, is_active, updated_at')
    .single()

  if (error) {
    // Unique constraint violation
    if (error.code === '23505') return NextResponse.json({ error: 'That DC Location / Cluster ID combination already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/dc-cluster-mappings — update a mapping (edit fields or toggle active)
export async function PATCH(request: NextRequest) {
  const caller = await assertAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, dc_location, cluster_id, is_active } = await request.json()

  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const admin = createAdminClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (dc_location !== undefined) {
    if (!dc_location.trim()) return NextResponse.json({ error: 'DC Location cannot be empty.' }, { status: 400 })
    updates.dc_location = dc_location.trim().toUpperCase()
  }
  if (cluster_id !== undefined) {
    if (!cluster_id.trim()) return NextResponse.json({ error: 'Cluster ID cannot be empty.' }, { status: 400 })
    updates.cluster_id = cluster_id.trim().toLowerCase()
  }
  if (is_active !== undefined) {
    updates.is_active = is_active
  }

  // Check duplicate if dc_location or cluster_id is changing
  if (dc_location !== undefined || cluster_id !== undefined) {
    const { data: current } = await admin.from('dc_cluster_mappings').select('dc_location, cluster_id').eq('id', id).single()
    if (current) {
      const newDc  = (updates.dc_location  as string) ?? current.dc_location
      const newCid = (updates.cluster_id as string) ?? current.cluster_id
      const { data: dup } = await admin
        .from('dc_cluster_mappings')
        .select('id')
        .eq('dc_location', newDc)
        .eq('cluster_id', newCid)
        .neq('id', id)
        .single()
      if (dup) return NextResponse.json({ error: `Mapping ${newDc} / ${newCid} already exists.` }, { status: 409 })
    }
  }

  const { data, error } = await admin
    .from('dc_cluster_mappings')
    .update(updates)
    .eq('id', id)
    .select('id, dc_location, cluster_id, is_active, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That DC Location / Cluster ID combination already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
