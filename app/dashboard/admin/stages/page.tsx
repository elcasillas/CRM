import { redirect } from 'next/navigation'

// Deal Stages has moved to Settings (/dashboard/admin/health-scoring).
// This redirect preserves any existing bookmarks.
export default function StagesPage() {
  redirect('/dashboard/admin/health-scoring')
}
