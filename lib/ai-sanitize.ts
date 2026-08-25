// ── Output sanitisation for AI generated content ─────────────────────────────
// Prompt rules ask the model to avoid certain punctuation; these functions
// guarantee it. Every generated string passes through here before it is
// displayed, copied, or handed to a mail client.

/** Words that open a question, used to pick "?" over "." at a clause break. */
const INTERROGATIVE = /^(what|how|when|who|whom|whose|why|which|where|is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|shall|may|might|must|any)\b/i

/** Em dash, en dash, horizontal bar, figure dash. */
const DASHES = /[‒–—―]/

/** True when the text still contains an em or en dash. */
export function hasDashes(text: string): boolean {
  return DASHES.test(text)
}

/**
 * Replace em and en dashes with clean punctuation, choosing a replacement that
 * keeps the sentence well formed rather than blindly substituting ". ".
 *
 * - numeric ranges become "to"
 * - a dash opening a line is dropped
 * - a spaced dash becomes a sentence break, "?" when the clause it closes is a
 *   question, "." otherwise
 * - a dash inside a word becomes a space
 */
export function normalizeDashes(text: string): string {
  if (!text) return text
  let out = text

  // Numeric ranges: "2025 — 2026" or "3—6"
  out = out.replace(/(\d)\s*[‒–—―]+\s*(\d)/g, '$1 to $2')

  // A dash leading a line is list formatting, not punctuation
  out = out.replace(/^[ \t]*[‒–—―]+[ \t]+/gm, '')

  // Spaced dash: a clause break. Close the clause the way it reads.
  out = out.replace(/[ \t]*[‒–—―]+[ \t]*/g, (match, offset: number, full: string) => {
    // Nothing but whitespace around it at a line edge: just drop it
    const before = full.slice(0, offset)
    const after = full.slice(offset + match.length)
    if (!before.trim() || !after.trim()) return ' '

    // Start of the sentence this dash sits in, ignoring any list numbering
    const sentenceStart = Math.max(
      before.lastIndexOf('.'), before.lastIndexOf('!'),
      before.lastIndexOf('?'), before.lastIndexOf('\n'),
    ) + 1
    const clause = before.slice(sentenceStart).replace(/^\s*\d+[.)]\s*/, '').trim()

    // How the sentence finishes tells us whether it was a question
    const endMatch = after.match(/[.!?\n]/)
    const endsQuestion = endMatch ? endMatch[0] === '?' : false

    // A fragment with no sentence punctuation either side reads as a title or
    // label, where a full stop would be wrong. Join it with a comma instead.
    if (!endMatch && !/[.!?]/.test(before)) return ', '

    return INTERROGATIVE.test(clause) && endsQuestion ? '? ' : '. '
  })

  // Any dash still inside a word: keep both halves readable
  out = out.replace(/(\w)[‒–—―]+(\w)/g, '$1 $2')

  // Belt and braces: nothing may survive
  out = out.replace(/[‒–—―]/g, ' ')

  // Capitalise after any sentence break introduced above
  out = out.replace(/([.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())

  // Tidy the spacing left behind
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').replace(/\s+([.,;:?!])/g, '$1')
  return out
}

/**
 * Replace semicolons with a sentence break. A semicolon joining a clause to
 * the list that explains it reads better as a colon, so that case is kept.
 */
export function stripSemicolons(text: string): string {
  if (!text) return text
  let out = text
  // "three dependencies; provisioning, reporting and billing" reads as a list
  out = out.replace(/\s*;\s*(?=[a-z][^.!?\n]*,)/g, ': ')
  out = out.replace(/\s*;\s*/g, '. ')
  out = out.replace(/([.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
  return out
}

/** Every punctuation guarantee that applies to generated follow-up content. */
export function sanitizeGeneratedText(text: string): string {
  return stripSemicolons(normalizeDashes(text))
}
