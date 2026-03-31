import { stageColor, stageTextColor } from '@/lib/deal-stage-colors'

interface DealStageBadgeProps {
  stageName:  string
  className?: string
}

export function DealStageBadge({ stageName, className = '' }: DealStageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      style={{
        backgroundColor: stageColor(stageName),
        color:           stageTextColor(stageName),
      }}
    >
      {stageName}
    </span>
  )
}
