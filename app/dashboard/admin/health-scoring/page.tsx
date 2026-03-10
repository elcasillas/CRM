import HealthScoringClient from './health-scoring-client'
import InspectionConfigClient from '../inspection/inspection-client'

export default function HealthScoringPage() {
  return (
    <>
      <HealthScoringClient />
      <InspectionConfigClient />
    </>
  )
}
