import {describe,expect,it} from 'vitest';
import {buildValhallaDistanceProgression} from './valhalla-distance';

const routeShape='_iszf@_nnhsC'+'?owH'.repeat(12);
const edges=Array.from({length:12},(_,index)=>({
  begin_shape_index:index,end_shape_index:index+1,length:0.52,
}));

describe('Valhalla edge distance reconciliation',()=>{
  it('accepts a route-summary difference within accumulated edge precision',()=>{
    const result=buildValhallaDistanceProgression({routeShape,routeLengthKm:6.246,
      trace:{shape:routeShape,edges}});
    expect(result.distanceMeters).toBe(6240);
    expect(result.cumulativeMeters).toHaveLength(13);
    expect(result.cumulativeMeters.at(-1)).toBe(6240);
  });

  it('rejects a discrepancy beyond the edge precision bound',()=>{
    expect(()=>buildValhallaDistanceProgression({routeShape,routeLengthKm:6.250,
      trace:{shape:routeShape,edges}})).toThrow('Valhalla route distance cannot be verified');
  });

  it('rejects an edge that adds tens of metres beyond its saved geometry',()=>{
    const shortShape='_iszf@_nnhsC?owH';
    expect(()=>buildValhallaDistanceProgression({routeShape:shortShape,routeLengthKm:0.55,
      trace:{shape:shortShape,edges:[{begin_shape_index:0,end_shape_index:1,length:0.55}]}}))
      .toThrow('Valhalla route distance cannot be verified');
  });
});
