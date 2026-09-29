import {Router} from 'express';
import {z} from 'zod';
import {requireAuth} from '../../middleware/auth';
import {asyncHandler} from '../../shared/http/async-handler';
import {AppError} from '../../shared/errors/app-error';
import * as service from './posted-routes.service';
import {postedRouteSeatService} from './seat-booking.service';
export const postedRouteRouter=Router();
postedRouteRouter.use(requireAuth);
postedRouteRouter.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const input=z.strictObject({vehicle_id:z.uuid(),mode:z.enum(['bike','scooter','car']),origin:point,destination:point,
  departure_at:z.iso.datetime({offset:true}),capacity:z.number().int().min(1).max(8)});
const selection=z.strictObject({route_version:z.number().int().positive(),pickup:point,dropoff:point});
function key(value:string|undefined){if(!value||value.length>128)
  throw new AppError(400,'Idempotency-Key required','IDEMPOTENCY_KEY_REQUIRED');return value;}
postedRouteRouter.get('/seat-operations/:id',asyncHandler(async(req,res)=>res.json({operation:
  await postedRouteSeatService.operation(req.user!.userId,z.uuid().parse(req.params.id))})));
postedRouteRouter.post('/:id/requests',asyncHandler(async(req,res)=>res.status(201).json(
  await postedRouteSeatService.mutate(req.user!.userId,key(req.get('Idempotency-Key')),
    'requested',z.uuid().parse(req.params.id),selection.parse(req.body)))));
postedRouteRouter.post('/requests/:id/accept',asyncHandler(async(req,res)=>{
  z.strictObject({}).parse(req.body??{});
  res.json(await postedRouteSeatService.mutate(req.user!.userId,key(req.get('Idempotency-Key')),
    'accepted',z.uuid().parse(req.params.id)));}));
postedRouteRouter.post('/requests/:id/reject',asyncHandler(async(req,res)=>{
  z.strictObject({}).parse(req.body??{});
  res.json(await postedRouteSeatService.mutate(req.user!.userId,key(req.get('Idempotency-Key')),
    'rejected',z.uuid().parse(req.params.id)));}));
postedRouteRouter.get('/mine',asyncHandler(async(req,res)=>res.json({offers:await service.mine(req.user!.userId)})));
postedRouteRouter.get('/operations/:id',asyncHandler(async(req,res)=>res.json({operation:await service.operation(req.user!.userId,z.uuid().parse(req.params.id))})));
postedRouteRouter.get('/:id',asyncHandler(async(req,res)=>res.json({offer:await service.read(req.user!.userId,z.uuid().parse(req.params.id))})));
postedRouteRouter.post('/:id/quote',asyncHandler(async(req,res)=>{
  const picked=selection.parse(req.body);
  res.json({quote:await service.quote(req.user!.userId,z.uuid().parse(req.params.id),picked.route_version,picked.pickup,picked.dropoff)});
}));
postedRouteRouter.post('/',asyncHandler(async(req,res)=>{const key=req.get('Idempotency-Key');
  if(!key||key.length>128)throw new AppError(400,'Idempotency-Key required','IDEMPOTENCY_KEY_REQUIRED');
  res.status(201).json({offer:await service.prepare(req.user!.userId,key,input.parse(req.body))});}));
