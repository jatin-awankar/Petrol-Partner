import {Router} from 'express';
import {z} from 'zod';
import {requireAuth} from '../../middleware/auth';
import {asyncHandler} from '../../shared/http/async-handler';
import {AppError} from '../../shared/errors/app-error';
import * as service from './adult-declaration.service';
export const adultDeclarationRouter=Router();
adultDeclarationRouter.use(requireAuth);
adultDeclarationRouter.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
adultDeclarationRouter.get('/',asyncHandler(async(req,res)=>res.json({declaration:await service.getStatus(req.user!.userId)})));
function key(value:string|undefined){if(!value||value.length>128)throw new AppError(400,
  'Idempotency-Key is required','IDEMPOTENCY_KEY_REQUIRED');return value;}
adultDeclarationRouter.put('/',asyncHandler(async(req,res)=>{
  const body=z.strictObject({at_least_18:z.literal(true),policy_version:z.string()}).parse(req.body);
  res.json(await service.mutate(req.user!.userId,key(req.get('Idempotency-Key')),'declare',body.policy_version));
}));
adultDeclarationRouter.post('/withdraw',asyncHandler(async(req,res)=>{
  const body=z.strictObject({policy_version:z.string()}).parse(req.body);
  res.json(await service.mutate(req.user!.userId,key(req.get('Idempotency-Key')),'withdraw',body.policy_version));
}));
