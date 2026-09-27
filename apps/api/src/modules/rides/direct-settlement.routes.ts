import {Router} from 'express';
import {z} from 'zod';
import {requireAuth} from '../../middleware/auth';
import {asyncHandler} from '../../shared/http/async-handler';
import {AppError} from '../../shared/errors/app-error';
import {directSettlementService} from './direct-settlement.service';
export const directSettlementRouter=Router();
directSettlementRouter.use(requireAuth);
directSettlementRouter.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
function actor(req:{user?:{userId:string}}){if(!req.user) throw new AppError(401,'Unauthorized','UNAUTHORIZED');return req.user.userId;}
function key(value:string|undefined){if(!value||value.length>128) throw new AppError(400,
  'Idempotency-Key is required','IDEMPOTENCY_KEY_REQUIRED');return value;}
directSettlementRouter.get('/',asyncHandler(async(req,res)=>{res.json({obligations:await directSettlementService.list(actor(req))});}));
directSettlementRouter.get('/operations/:id',asyncHandler(async(req,res)=>{
  res.json({operation:await directSettlementService.operation(actor(req),z.uuid().parse(req.params.id))});
}));
directSettlementRouter.get('/:id',asyncHandler(async(req,res)=>{
  res.json({obligation:await directSettlementService.detail(actor(req),z.uuid().parse(req.params.id))});
}));
directSettlementRouter.post('/:id/claim',asyncHandler(async(req,res)=>{
  const {method}=z.strictObject({method:z.enum(['cash','upi'])}).parse(req.body);
  res.json(await directSettlementService.mutate(actor(req),key(req.get('Idempotency-Key')),
    z.uuid().parse(req.params.id),'claim',method));
}));
for(const action of ['confirm','dispute'] as const) directSettlementRouter.post(`/:id/${action}`,
  asyncHandler(async(req,res)=>{
    z.strictObject({}).parse(req.body??{});
    res.json(await directSettlementService.mutate(actor(req),key(req.get('Idempotency-Key')),
      z.uuid().parse(req.params.id),action));
  }));
