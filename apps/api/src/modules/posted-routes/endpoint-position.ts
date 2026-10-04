import type {Point} from './routing';

export function pointMetres(a:Point,b:Point){
  const rad=Math.PI/180,lat=(a[1]+b[1])*rad/2;
  return Math.hypot((a[0]-b[0])*rad*6371000*Math.cos(lat),(a[1]-b[1])*rad*6371000);
}

// Inspect the endpoint's continuous local pass, not every clamped projection as
// a separate stop. Dense straight geometry is valid. Returning toward the stop
// or re-entering its 30 m neighbourhood is conservatively ambiguous.
export function singleEndpointPass(coordinates:Point[],point:Point,fromEnd:boolean){
  const ordered=fromEnd?[...coordinates].reverse():coordinates;
  const scaleX=6371000*Math.PI/180*Math.cos(point[1]*Math.PI/180),scaleY=6371000*Math.PI/180;
  let previous=pointMetres(point,ordered[0]),leftNeighbourhood=false;
  for(let i=1;i<ordered.length;i++){
    const a=ordered[i-1],b=ordered[i];
    const x=(point[0]-a[0])*scaleX,y=(point[1]-a[1])*scaleY;
    const dx=(b[0]-a[0])*scaleX,dy=(b[1]-a[1])*scaleY;
    const fraction=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy)));
    if(!Number.isFinite(fraction))return false;
    const closest:Point=[a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])];
    const distance=pointMetres(point,closest);
    if(distance<=30&&(leftNeighbourhood||distance<previous-0.2))return false;
    previous=pointMetres(point,b);
    if(previous>30)leftNeighbourhood=true;
  }
  return true;
}
