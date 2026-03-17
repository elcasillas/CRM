import HealthScoringClient from './health-scoring-client'
import InspectionConfigClient from '../inspection/inspection-client'
import DcClusterClient from '../dc-cluster-mappings/dc-cluster-client'
import { StagesClient } from '../stages/stages-client'

export default function HealthScoringPage() {
  return (
    <>
      <HealthScoringClient />
      <InspectionConfigClient />
      <DcClusterClient />
      <StagesClient />
    </>
  )
}
