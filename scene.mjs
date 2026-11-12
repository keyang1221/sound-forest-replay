// Approximate platform centers from the supplied floor plan, centered on S3.
// Camera elevation and azimuth are both 45 degrees (architectural axonometry).
const PLAN=[
 {id:5,x:-1.64,z:.30},{id:4,x:-.96,z:-.78},{id:3,x:0,z:0},
 {id:2,x:.92,z:-.78},{id:1,x:1.64,z:.14}
];
const azimuth=Math.PI/4,elevation=Math.PI/4;
const raw=(x,z)=>({x:x*Math.cos(azimuth)+z*Math.sin(azimuth),y:(z*Math.cos(azimuth)-x*Math.sin(azimuth))*Math.sin(elevation)});

const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const t=clamp(n);return t*t*(3-2*t);};

// One viewport of scroll rotates the camera; the following half reveals the dock.
export function scrollScene(offset,extent=1.5){
 const distance=extent>0?offset/extent*1.5:0;
 return {camera:ease(distance),controls:ease((distance-1)*2)};
}

function movingScene(width,height,progress,objectScale,{circleScale=1,ropeLengthScale=1}={}){
 // End just above floor level so the staggered rear platforms stay readable.
 const elevation=(1-clamp(progress))*Math.PI/2+clamp(progress)*Math.PI/24;
 const vertical=Math.cos(elevation),depth=Math.sin(elevation);
 const fullHeight=height*.57;
 // Keep world scale constant throughout the camera move; only projection changes.
 const scale=Math.min((width-56)/4.26,Math.sqrt(Math.max(1,(height-70)**2-fullHeight**2))/2.5);
 const room=[[-2.13,-1.08],[2.13,-1.08],[2.13,.92],[-2.13,.92]];
 const ropeHeight=fullHeight*vertical*ropeLengthScale,ellipseRatio=Math.max(.085,depth);
 const ys=room.map(([,z])=>z*scale*depth);
 for(const p of PLAN)ys.push(p.z*scale*depth-(ropeHeight+4)*objectScale,p.z*scale*depth+(.35*scale*circleScale*ellipseRatio+25)*objectScale);
 const originY=height/2-(Math.min(...ys)+Math.max(...ys))/2;
 const project=(x,z)=>({x:width/2+x*scale,y:originY+z*scale*depth});
 const items=PLAN.map(p=>({...p,...project(p.x,p.z),radius:.28*scale*circleScale*(p.id===3?1.25:1)})).sort((a,b)=>a.z-b.z);
 return {items,project,ropeHeight,objectScale,wallHeight:fullHeight*.45*vertical,room,ellipseRatio,thickness:Math.max(.4,2*depth)};
}

export function layoutScene(width,height,progress,objectScale=1,dimensions){
 if(progress!==undefined)return movingScene(width,height,progress,objectScale,dimensions);
 const points=PLAN.map(p=>({...p,...raw(p.x,p.z)}));
 const ropeHeight=Math.min(222,Math.max(135,height*.38)),wallHeight=ropeHeight*.60;
 const room=[[-2.13,-1.08],[2.13,-1.08],[2.13,.92],[-2.13,.92]];
 const bounds=scale=>{
  const floor=room.map(([x,z])=>raw(x,z));
  const xs=floor.map(p=>p.x*scale),ys=floor.map(p=>p.y*scale+8);
  for(const index of [0,1,2])ys.push(floor[index].y*scale-wallHeight);
  for(const p of points)ys.push(p.y*scale-ropeHeight-4,p.y*scale+.35*scale*Math.SQRT1_2+34);
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
 };
 let lo=1,hi=width;
 for(let i=0;i<32;i++){const mid=(lo+hi)/2,b=bounds(mid);if(b.maxX-b.minX>width-44||b.maxY-b.minY>height-40)hi=mid;else lo=mid;}
 const scale=lo,b=bounds(scale),originX=width/2-(b.minX+b.maxX)/2,originY=height/2-(b.minY+b.maxY)/2;
 const project=(x,z)=>{const p=raw(x,z);return {x:originX+p.x*scale,y:originY+p.y*scale};};
 const baseRadius=.28*scale;
 const items=points.map(p=>({...p,x:originX+p.x*scale,y:originY+p.y*scale,radius:p.id===3?baseRadius*1.25:baseRadius})).sort((a,b)=>a.y-b.y);
 return {items,project,ropeHeight,wallHeight,room,ellipseRatio:Math.SQRT1_2,thickness:Math.max(3,Math.min(7,scale*.025))};
}
