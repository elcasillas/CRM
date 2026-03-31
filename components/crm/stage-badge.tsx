import { stageColor, stageTextColor } from '@/lib/deal-stage-colors'

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{
        backgroundColor: stageColor(stage),
        color:           stageTextColor(stage),
      }}
    >
      {stage}
    </span>
  )
}
