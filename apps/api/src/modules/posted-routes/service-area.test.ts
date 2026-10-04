import {describe,it,expect} from 'vitest';
import {coordinateEnvelope,serviceAreaPoint,loadServiceArea,SERVICE_AREA} from './service-area';
describe('pinned original Amravati coordinate domain',()=>{
  it('checks exact packaged bytes',()=>expect(loadServiceArea()).toEqual(SERVICE_AREA));
  it.each([
    [77.73,[77729999n,77730001n]],[77.730001,[77730000n,77730002n]],
    [77.73000100000001,[77730000n,77730003n]],[77.73000099999999,[77729999n,77730002n]],
    [-0.0000001,[-2n,1n]],[1e-7,[-1n,2n]],
  ])('outward-encloses %s without floating multiplication',(x,expected)=>expect(coordinateEnvelope(x as number)).toEqual(expected));
  it.each([77.73,77.730001,77.829999,77.83,77.729999,77.830001])('rejects longitude edge/guard %s',x=>expect(serviceAreaPoint([x,20.93])).toBe(false));
  it.each([20.89,20.890001,20.969999,20.97,20.889999,20.970001])('rejects latitude edge/guard %s',y=>expect(serviceAreaPoint([77.78,y])).toBe(false));
  it.each([[77.730002,20.890002],[77.829998,20.969998]])('accepts two-quantum clearance', (x,y)=>expect(serviceAreaPoint([x,y],true)).toBe(true));
  it('rejects unsupported encoded precision and invalid numbers',()=>{
    for(const x of [NaN,Infinity,181,77.7300021])expect(()=>coordinateEnvelope(x,true)).toThrow();
  });
});

import {evaluateServiceArea} from './service-area';
import type {VerifiedRoute} from './routing';
import manifest from '../../../../../docs/operations/evidence/ticket10-local-valhalla-manifest-2026-10-03.json';
function routeFixture():VerifiedRoute{
  return {source:'valhalla',mode:'car',geometry:{type:'LineString',coordinates:[[77.75,20.91],[77.76,20.92]]},
    cumulativeMeters:[0,1500],distanceMeters:1500,durationSeconds:60,
    verification:{manifest,manifestDigest:'a'.repeat(64),costing:'auto',costingOptions:{},normalizationVersion:'valhalla-edge-metres-2026-10-03.1',
      edges:[{begin_shape_index:0,end_shape_index:1,end_node:{elapsed_time:60}}],
      requested:{origin:[77.75,20.91],destination:[77.76,20.92]},routed:{origin:[77.75,20.91],destination:[77.76,20.92]}}};
}
it('preserves inclusive 50 km and 90-minute caps',()=>{
  const route=routeFixture();route.distanceMeters=50000;route.cumulativeMeters=[0,50000];route.durationSeconds=5400;
  route.verification!.edges=[{begin_shape_index:0,end_shape_index:1,end_node:{elapsed_time:5400}}];
  expect(evaluateServiceArea(route).outsideMetres).toBe(0);
  route.distanceMeters=50001;route.cumulativeMeters=[0,50001];expect(()=>evaluateServiceArea(route)).toThrow();
  route.distanceMeters=50000;route.cumulativeMeters=[0,50000];route.durationSeconds=5401;expect(()=>evaluateServiceArea(route)).toThrow();
});
it('rejects unknown normalization, encoded sub-quantum precision and discontinuous timing',()=>{
  const route=routeFixture();route.verification!.normalizationVersion='unknown';expect(()=>evaluateServiceArea(route)).toThrow();
  route.verification!.normalizationVersion='valhalla-edge-metres-2026-10-03.1';
  route.geometry.coordinates[1]=[77.7600001,20.92];expect(()=>evaluateServiceArea(route)).toThrow();
  route.geometry.coordinates[1]=[77.76,20.92];route.verification!.edges=[{begin_shape_index:1,end_shape_index:1,end_node:{elapsed_time:60}}];
  expect(()=>evaluateServiceArea(route)).toThrow();
});
