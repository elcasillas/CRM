// Centralized deal stage color configuration
// Apply everywhere stages are rendered: tables, cards, modals, kanban, pipeline

export const DEAL_STAGE_COLORS = {
  initial:      '#33C3C7',
  qualified:    '#00ADB1',
  presenting:   '#00989C',
  shortlisted:  '#3A86FF',
  negotiation:  '#FFC857',
  signed:       '#F77F00',
  implementing: '#2DC653',
  closedWon:    '#1B9C4B',
  closedLost:   '#B1005A',
} as const

type StageKey = keyof typeof DEAL_STAGE_COLORS

// Map a stage name (from DB) to a color key
export function mapStageToKey(stage: string): StageKey {
  const n = stage.toLowerCase()
  if (n.includes('initial'))                          return 'initial'
  if (n.includes('qualified'))                        return 'qualified'
  if (n.includes('presenting'))                       return 'presenting'
  if (n.includes('short'))                            return 'shortlisted'
  if (n.includes('negotiation'))                      return 'negotiation'
  if (n.includes('signed'))                           return 'signed'
  // "Closed Implemented" must be checked before plain "implement"
  if (n.includes('closed') && n.includes('implement')) return 'closedWon'
  if (n.includes('implement'))                        return 'implementing'
  if (n.includes('closed won'))                       return 'closedWon'
  if (n.includes('closed lost') || n.includes('lost')) return 'closedLost'
  return 'qualified'
}

// Hex background color for a stage name
export function stageColor(stageName: string): string {
  return DEAL_STAGE_COLORS[mapStageToKey(stageName)]
}

// Returns '#FFFFFF' for dark backgrounds, '#1F2A2B' for light ones (e.g. #FFC857)
function isLightColor(hex: string): boolean {
  const c   = hex.replace('#', '')
  const rgb = parseInt(c, 16)
  const r   = (rgb >> 16) & 0xff
  const g   = (rgb >>  8) & 0xff
  const b   = (rgb >>  0) & 0xff
  return 0.299 * r + 0.587 * g + 0.114 * b > 186
}

export function stageTextColor(stageName: string): string {
  return isLightColor(stageColor(stageName)) ? '#1F2A2B' : '#FFFFFF'
}
