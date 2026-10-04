import {SERVICE_AREA,serviceAreaReviewEvidenceHash} from '../modules/posted-routes/service-area';
// Explicit synthetic approval: never an operator attestation.
export const serviceAreaApprovalFixture=()=>({status:'approved',approver:'Jatin Awankar',
  reviewedAt:'2026-10-04T00:00:00.000Z',areaId:SERVICE_AREA.id,geometrySha256:SERVICE_AREA.geometrySha256,
  calculationVersion:SERVICE_AREA.calculationVersion,evidenceSha256:serviceAreaReviewEvidenceHash(),
  modes:['car','bike','scooter'],coverageAndMeetingPlacesReviewed:true,completeRoutesReviewed:true,
  authorshipAndLimitationsAcknowledged:true,reviewNotes:'SYNTHETIC TEST ONLY: no operator meeting-place, map, local-route or safety review has occurred.'});
