import type { InspectionResult } from './deal-inspect'

// ── Owner follow-up email generation ─────────────────────────────────────────
// Single source of truth for the "Email Owner" template. Both the Email Owner
// action (opens mailto:) and the Template action (copies to clipboard) call
// composeOwnerEmail so the two can never drift apart.

export interface ComposedEmail {
  subject: string
  body: string
  /** inspection returned alongside the email, when the API supplied one */
  inspection?: InspectionResult | null
}

/** Deal fields the offline fallback template needs. */
export interface FallbackDealInfo {
  deal_name: string
  deal_stages?: { stage_name: string } | null
  deal_owner?: { full_name: string | null } | null
}

/** Local template used when the compose-email API is unavailable. */
export function fallbackOwnerEmail(deal: FallbackDealInfo): ComposedEmail {
  const stageName = deal.deal_stages?.stage_name ?? 'unknown stage'
  const ownerName = deal.deal_owner?.full_name ?? 'there'
  return {
    subject: `Deal Update: ${deal.deal_name}`,
    body: `Hi ${ownerName},\n\nI wanted to follow up on "${deal.deal_name}" (${stageName}).\n\nCould you please provide a current status update and flag any blockers?\n\nThanks.`,
  }
}

/**
 * Generate the owner follow-up email for a deal via the compose-email API,
 * falling back to the local template if the request fails or returns nothing.
 */
export async function composeOwnerEmail(dealId: string, deal: FallbackDealInfo): Promise<ComposedEmail> {
  try {
    const res = await fetch(`/api/deals/${dealId}/compose-email`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.subject && data.body) {
        return { subject: data.subject, body: data.body, inspection: (data.inspection as InspectionResult) ?? null }
      }
    }
  } catch (_e) { /* fall through to local template */ }
  return fallbackOwnerEmail(deal)
}

/** Plain-text rendering of a composed email, for clipboard use. */
export function renderEmailText(email: ComposedEmail): string {
  return `Subject: ${email.subject}\n\n${email.body}`
}

/** Copy text to the clipboard, with a fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (_e) {
    return false
  }
}
