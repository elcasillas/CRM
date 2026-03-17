import HealthScoringClient from './health-scoring-client'
import InspectionConfigClient from '../inspection/inspection-client'
import DcClusterClient from '../dc-cluster-mappings/dc-cluster-client'

export default function HealthScoringPage() {
  return (
    <>
      <HealthScoringClient />
      <InspectionConfigClient />
      <DcClusterClient />
    </>
  )
}
