import {DOT_RADIUS} from './heatmap-layout.mjs';
// Method matches the referenced October analysis: complete clock-aligned cells,
// nearest-rank quartiles over positive cells, and a separate zero anchor.
export const ANALYSIS_COLORS=['#414748','#65b887','#a4ce6a','#f2d25c','#ed6d5a','#dc4545'];
export const HISTORICAL_FLAGS={
 '2026-10-19':'Previously flagged as having no valid daytime records: only five triggers outside opening hours; excluded from the shared color scale.',
 '2026-10-21':'Previously flagged as a partial recording.'
};
export function aggregateDay(day,start=36000,end=61200,binSeconds=120){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>86400||start>=end)throw new Error('Invalid time range');
 if(!Number.isInteger(binSeconds)||binSeconds<=0)throw new Error('Invalid time interval');
 const binCount=Math.ceil((end-start)/binSeconds);
 const series=Array.from({length:5},(_,i)=>({id:i+1,total:0,cells:Array.from({length:binCount},(_,b)=>({start:start+b*binSeconds,end:Math.min(end,start+(b+1)*binSeconds),count:0}))}));
 let total=0,max=0;
 for(const event of day.events){
  if(event.t<start||event.t>=end)continue;
  const row=series[event.stringId-1],cell=row.cells[Math.floor((event.t-start)/binSeconds)];
  cell.count++;row.total++;total++;max=Math.max(max,cell.count);
 }
 return {date:day.date,start,end,binSeconds,binCount,series,total,max};
}
export function nonzeroQuartiles(values){
 const sorted=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
 if(!sorted.length)return {sampleSize:0,q1:null,median:null,q3:null,max:0};
 const rank=p=>sorted[Math.ceil(p*sorted.length)-1];
 return {sampleSize:sorted.length,q1:rank(.25),median:rank(.5),q3:rank(.75),max:sorted.at(-1)};
}
export function calendarWeek(date){
 const day=new Date(`${date}T00:00:00Z`),offset=(day.getUTCDay()+6)%7;
 day.setUTCDate(day.getUTCDate()-offset);
 return Array.from({length:7},(_,i)=>new Date(day.getTime()+i*86400000).toISOString().slice(0,10));
}
export function weekOptionLabel(date){
 const monday=calendarWeek(date)[0],thursday=new Date(`${monday}T00:00:00Z`);
 thursday.setUTCDate(thursday.getUTCDate()+3);
 const yearStart=Date.UTC(thursday.getUTCFullYear(),0,1);
 const week=Math.ceil(((thursday.getTime()-yearStart)/86400000+1)/7);
 return `${monday.replaceAll('-','/')} W${String(week).padStart(2,'0')}`;
}
export function buildDataset(rawDays,start=36000,end=61200,binSeconds=120){
 const days=rawDays.map(d=>aggregateDay(d,start,end,binSeconds));
 const scaleDays=days.filter(d=>d.date!=='2026-10-19');
 return {days,scaleDates:scaleDays.map(d=>d.date).sort(),quartiles:nonzeroQuartiles(scaleDays.flatMap(d=>d.series.flatMap(r=>r.cells.map(c=>c.count))))};
}
export function colorForCount(value,q){
 if(!q.max||!(value>0))return ANALYSIS_COLORS[0];
 const anchors=[0,1,q.q1,q.median,q.q3,q.max],n=Math.min(q.max,Math.max(1,value));
 for(let i=anchors.length-1;i>=0;i--)if(n===anchors[i])return ANALYSIS_COLORS[i];
 for(let i=0;i<anchors.length-1;i++){
  const lower=anchors[i],upper=anchors[i+1];if(n>upper)continue;
  if(upper<=lower)return ANALYSIS_COLORS[i+1];
  const a=ANALYSIS_COLORS[i],b=ANALYSIS_COLORS[i+1],t=(n-lower)/(upper-lower);
  return '#'+[1,3,5].map(k=>Math.round(parseInt(a.slice(k,k+2),16)+(parseInt(b.slice(k,k+2),16)-parseInt(a.slice(k,k+2),16))*t).toString(16).padStart(2,'0')).join('');
 }
 return ANALYSIS_COLORS.at(-1);
}
// Area (rather than radius) grows between the same anchors as the color scale.
// Wider area range makes low and high activity visibly different.
export function radiusForCount(value,q,maxRadius=DOT_RADIUS){
 const areas=[.0025,.0225,.09,.25,.5625,1];
 if(!q.max||!(value>0))return maxRadius*Math.sqrt(areas[0]);
 const anchors=[0,1,q.q1,q.median,q.q3,q.max],n=Math.min(q.max,Math.max(1,value));
 for(let i=anchors.length-1;i>=0;i--)if(n===anchors[i])return maxRadius*Math.sqrt(areas[i]);
 for(let i=0;i<anchors.length-1;i++){
  const lower=anchors[i],upper=anchors[i+1];if(n>upper)continue;
  if(upper<=lower)return maxRadius*Math.sqrt(areas[i+1]);
  const t=(n-lower)/(upper-lower);
  return maxRadius*Math.sqrt(areas[i]+(areas[i+1]-areas[i])*t);
 }
 return maxRadius;
}
// Bounded monotone cubics preserve the existing peak-chart shape without overshoot.
export function buildMonotoneGeometry(points){
 const coordinate=n=>Number(n).toFixed(2);
 if(!points.length)return {path:'',segments:[]};
 const move=`M${coordinate(points[0].x)},${coordinate(points[0].y)}`;
 if(points.length===1)return {path:move,segments:[]};
 const slopes=points.slice(0,-1).map((p,i)=>(points[i+1].y-p.y)/(points[i+1].x-p.x));
 const tangents=points.map((_,i)=>i===0?slopes[0]:i===points.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:(slopes[i-1]+slopes[i])/2);
 for(let i=0;i<slopes.length;i++){
  if(slopes[i]===0){tangents[i]=0;tangents[i+1]=0;continue;}
  const magnitude=Math.hypot(tangents[i]/slopes[i],tangents[i+1]/slopes[i]);
  if(magnitude>3){tangents[i]=3/magnitude*tangents[i];tangents[i+1]=3/magnitude*tangents[i+1];}
 }
 const segments=points.slice(0,-1).map((p,i)=>{
  const next=points[i+1],w=next.x-p.x;
  return {index:i,d:`M${coordinate(p.x)},${coordinate(p.y)}C${coordinate(p.x+w/3)},${coordinate(p.y+tangents[i]*w/3)} ${coordinate(next.x-w/3)},${coordinate(next.y-tangents[i+1]*w/3)} ${coordinate(next.x)},${coordinate(next.y)}`};
 });
 return {path:move+segments.map(s=>s.d.slice(s.d.indexOf('C'))).join(''),segments};
}
