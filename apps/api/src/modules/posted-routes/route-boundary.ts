import {AppError} from '../../shared/errors/app-error';
import type {VerifiedRoute} from './routing';

type BoundaryEvidence={artifactSha256:string;policyVersion:string;outsideMetres:number;outsideSeconds:number};
type BoundaryCheck=(route:VerifiedRoute)=>Promise<BoundaryEvidence>;
let testCheck:BoundaryCheck|null=null;
export function setBoundaryCheckForTests(check:BoundaryCheck|null){
  if(process.env.NODE_ENV!=='test')throw new Error('Synthetic boundary checks are test only');
  testCheck=check;
}
export async function verifyRouteBoundary(route:VerifiedRoute){
  // No complete, reusable SOI artifact has been validated. Do not replace it
  // with a bounding box, provider admin name, or an unreviewed polygon.
  if(!testCheck)throw new AppError(503,'Verified Maharashtra boundary unavailable','BOUNDARY_UNAVAILABLE');
  const result=await testCheck(route);
  if(!/^[a-f0-9]{64}$/.test(result.artifactSha256)||result.policyVersion!=='2026-10-03.2'||
    !Number.isFinite(result.outsideMetres)||result.outsideMetres<0||result.outsideMetres>5000||
    !Number.isFinite(result.outsideSeconds)||result.outsideSeconds<0||result.outsideSeconds>600)
    throw new AppError(422,'Route outside operating boundary limits','BOUNDARY_INVALID');
  return result;
}
