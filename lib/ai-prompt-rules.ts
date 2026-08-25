// ── Shared rules for every AI generation path ────────────────────────────────
// One place for the instructions that must hold across deal inspection, owner
// emails and copied templates. Prompt sites include SHARED_GENERATION_RULES
// rather than assembling their own rule set, so the paths cannot diverge.

import { DATE_AWARENESS_RULES } from './ai-date-context'

/**
 * Keeps the pipeline invisible in the output. The deal context supplied to the
 * model is consolidated from CRM fields and notes; recipients should read about
 * the deal, never about where the text came from or how it was produced.
 */
export const SOURCE_FRAMING_RULES = `SOURCE FRAMING (mandatory):
- Treat everything supplied about the deal (CRM fields, notes, deal history, timelines) as ordinary deal knowledge you already have.
- Never mention artificial intelligence, AI, models, prompts, summaries-as-artifacts, automated analysis, generation, or any part of how this text was produced.
- Never write phrases like "the AI summary", "the AI summary references", "according to the AI-generated summary", "based on the summary provided", "the generated summary indicates", "the provided context shows", "the model identified", or "the prompt indicates".
- Write directly about the deal and its history, not about where the information came from.
- When attribution genuinely helps, attribute it naturally to the deal's own record: "previous notes indicate", "the latest update indicates", "the previous timeline showed", "the deal history references", "earlier updates identified".
- The reader must not be able to tell that any part of this was assembled or analysed automatically.`

/**
 * Punctuation restriction for every generated path. Enforced deterministically
 * after generation as well, via sanitizeGeneratedText in lib/ai-sanitize.
 */
export const OUTPUT_PUNCTUATION_RULES = `PUNCTUATION (mandatory):
- Never use an em dash or an en dash anywhere in the output.
- Never use a semicolon anywhere in the output.
- Where you would reach for either, use a period, a comma, a colon, or a separate sentence.
- If a question is followed by the options that answer it, close the question with a question mark and start a new sentence, or introduce the options with a colon.
- Write "What is their stated commitment level to proceeding? Are they actively evaluating, exploratory, or stalled?" and never join those two parts with a dash.
- Introduce a list with a colon rather than a semicolon: write "The migration has three dependencies: provisioning, reporting, and billing."`

/**
 * Punctuation restriction for the deal summary: no hyphens, dashes or
 * semicolons, in prose or in list formatting. Enforced deterministically after
 * generation as well, so the prompt only has to keep the prose natural.
 */
export const PLAIN_PUNCTUATION_RULES = `PUNCTUATION (mandatory):
- Never use a hyphen, an em dash, an en dash, or a semicolon anywhere in the output.
- Write normal sentences and paragraphs. Use commas, periods, colons and parentheses instead.
- Never start a list item with a dash. If a list is needed, use numbered items or separate short sentences.
- Rewrite compound phrases rather than hyphenating them: write "high priority" not "high-priority", "customer facing" not "customer-facing".
- Split a clause that would take an em dash into two sentences: write "The SOW is still pending. Henry is waiting for the final proposal."
- Introduce a list with a colon rather than a semicolon: write "The migration has three dependencies: provisioning, reporting, and billing."
- Write dates in words, for example "August 15, 2025", never "2025-08-15".`

/**
 * Output shape for generated follow-up content. The deal name and "Last note"
 * lines are prepended deterministically by the caller, so the model is asked
 * for the numbered items alone and never for a greeting, subject or sign off.
 */
export const FOLLOW_UP_OUTPUT_RULES = `OUTPUT FORMAT (mandatory):
- Return ONLY a numbered list of follow up items, starting at "1.". Nothing before it, nothing after it.
- This is not an email, not a Slack message, and not a note to a person. Do not write a greeting, an introduction, a preamble, a closing sentence, a sign off, a signature, or a subject line.
- Do not add headings, labels, commentary, or any explanation of what the list is.
- Do not restate the deal name or the date of the last note. Those are added separately.
- Write 3 to 6 items. One item per line, numbered sequentially.
- Each item is a direct, specific question or action about this deal. No filler.
- Order the items by importance, most critical first.
- Plain text only. No markdown, no bold, no bullet characters.`

/** Every shared rule block, in the order prompts should present them. */
export const SHARED_GENERATION_RULES = `${DATE_AWARENESS_RULES}

${SOURCE_FRAMING_RULES}

${OUTPUT_PUNCTUATION_RULES}`
