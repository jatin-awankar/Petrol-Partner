import {Router} from 'express';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {requireAuth} from '../../middleware/auth';
import {asyncHandler} from '../../shared/http/async-handler';
import {AppError} from '../../shared/errors/app-error';
import * as service from './driver-vehicle-declaration.service';
export const driverVehicleDeclarationRouter=Router();
driverVehicleDeclarationRouter.use(requireAuth);
driverVehicleDeclarationRouter.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const category=z.enum(['bike','scooter','car']);
const date=z.iso.date();
const version=z.string();
const driver=z.strictObject({licence_categories:z.array(category).min(1).max(3),
  licence_expires_on:date,policy_version:version});
const vehicle=z.strictObject({category,registration_identifier:z.string().trim().min(1).max(32),
  registration_expires_on:date,insurance_expires_on:date,permission_to_use:z.literal(true),
  belted_passenger_seats:z.number().int().min(1).max(8).nullable(),
  passenger_capacity:z.number().int().min(1).max(8),policy_version:version});
function key(req:{get:(name:string)=>string|undefined}){const value=req.get('Idempotency-Key');
  if(!value||value.length>128)throw new AppError(400,'Idempotency-Key is required','IDEMPOTENCY_KEY_REQUIRED');
  return value;}
driverVehicleDeclarationRouter.get('/',asyncHandler(async(req,res)=>res.json(await service.status(req.user!.userId))));
driverVehicleDeclarationRouter.get('/operations/:key',asyncHandler(async(req,res)=>res.json({
  operation:await service.getOperation(req.user!.userId,z.string().min(1).max(128).parse(req.params.key))})));
driverVehicleDeclarationRouter.put('/driver',asyncHandler(async(req,res)=>res.json(await service.mutate(
  req.user!.userId,key(req),'driver_declare',req.user!.userId,driver.parse(req.body)))));
driverVehicleDeclarationRouter.post('/driver/revoke',asyncHandler(async(req,res)=>res.json(await service.mutate(
  req.user!.userId,key(req),'driver_revoke',req.user!.userId,{}))));
driverVehicleDeclarationRouter.post('/vehicles',asyncHandler(async(req,res)=>{
  const id=createHash('sha256').update(`${req.user!.userId}:${key(req)}`).digest('hex');
  const vehicleId=`${id.slice(0,8)}-${id.slice(8,12)}-4${id.slice(13,16)}-8${id.slice(17,20)}-${id.slice(20,32)}`;
  res.json(await service.mutate(req.user!.userId,key(req),'vehicle_declare',vehicleId,vehicle.parse(req.body)));
}));
driverVehicleDeclarationRouter.put('/vehicles/:id',asyncHandler(async(req,res)=>res.json(await service.mutate(
  req.user!.userId,key(req),'vehicle_declare',z.uuid().parse(req.params.id),vehicle.parse(req.body)))));
driverVehicleDeclarationRouter.post('/vehicles/:id/revoke',asyncHandler(async(req,res)=>res.json(await service.mutate(
  req.user!.userId,key(req),'vehicle_revoke',z.uuid().parse(req.params.id),{}))));
