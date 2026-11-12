const FIELDS=['local_time','elapsed_s','string_id','amplitude_linear','slope_raw','pitch_level'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const clean=v=>v.trim().replace(/^"(.*)"$/,'$1');

export function parseLog(text,name='CSV') {
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
 const header=lines.shift()?.split(',').map(clean);
 if (!header || FIELDS.some((k,i)=>header[i]!==k) || header.length!==6) throw new Error('CSV fields do not match: expected the six Sound Forest log columns.');
 const days=new Map();let invalidRows=0;
 lines.forEach((line,sequence)=>{
  if(!line.trim())return;
  const f=line.split(',').map(clean);const match=f[0]?.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if(f.length!==6||!match||f.slice(1).some(v=>v===''||!Number.isFinite(Number(v)))){invalidRows++;return;}
  const [,yy,mm,dd,hh,mi,ss]=match.map(Number);
  const calendar=new Date(Date.UTC(2000+yy,mm-1,dd));
  const stringId=Number(f[2]),amplitude=Number(f[3]);
  if(calendar.getUTCFullYear()!==2000+yy||calendar.getUTCMonth()!==mm-1||calendar.getUTCDate()!==dd||hh>23||mi>59||ss>59||!Number.isInteger(stringId)||stringId<1||stringId>5||amplitude<0||amplitude>1||Number(f[1])<0){invalidRows++;return;}
  const date=`${2000+yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  if(!days.has(date))days.set(date,{date,name,events:[]});
  days.get(date).events.push({t:hh*3600+mi*60+ss,stringId,amplitude,slope:Number(f[4]),pitch:Number(f[5]),elapsed:Number(f[1]),sequence});
 });
 const result=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
 result.forEach(d=>d.events.sort((a,b)=>a.t-b.t||a.sequence-b.sequence));
 return {days:result,invalidRows};
}

export function prepareDay(day,start=36000,end=61200) {
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>86400||start>=end)throw new Error('Invalid time range');
 const events=day.events.filter(e=>e.t>=start&&e.t<end);
 const bins=Array(Math.ceil((end-start)/120)).fill(0),byString=Array.from({length:5},()=>[]);
 for(const e of events){bins[Math.floor((e.t-start)/120)]++;byString[e.stringId-1].push(e);}
 const nonzero=bins.filter(n=>n>0).sort((a,b)=>a-b);
 const scale=nonzero.length?nonzero[Math.floor((nonzero.length-1)*.95)]:0;
 return {...day,start,end,events,bins,scale,byString,totals:byString.map(a=>a.length)};
}

export function upperBound(events,t) {
 let lo=0,hi=events.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].t<=t)lo=mid+1;else hi=mid;}
 return lo;
}

// Use the same clock-aligned two-minute intervals as the activity timeline.
// Starting on an actual event avoids an empty lead-in at normal playback speed.
export function peakStart(day){
 if(!day.events.length)return null;
 const peak=Math.max(...day.bins),index=day.bins.indexOf(peak);
 return day.events.find(event=>event.t>=day.start+index*120)?.t??null;
}

export class Replay {
 constructor(day){this.day=day;this.seek(day.start);}
 seek(time){
  if(!Number.isFinite(time))throw new Error('Invalid time');
  this.time=clamp(time,this.day.start,this.day.end);
  this.cursor=upperBound(this.day.events,this.time);
  this.counts=this.day.byString.map(a=>upperBound(a,this.time));
  this.last=this.day.byString.map((a,i)=>this.counts[i]?a[this.counts[i]-1].t:null);
  return this.time;
 }
 advance(realSeconds,speed){
  if(!Number.isFinite(realSeconds)||realSeconds<0)throw new Error('Invalid time');
  if(!Number.isFinite(speed)||speed<1||speed>2000)throw new Error('Speed must be between 1 and 2000');
  this.time=Math.min(this.day.end,this.time+realSeconds*speed);
  const next=upperBound(this.day.events,this.time),fired=this.day.events.slice(this.cursor,next);
  for(const e of fired){this.counts[e.stringId-1]++;this.last[e.stringId-1]=e.t;}
  this.cursor=next;
  return {time:this.time,fired,done:this.time>=this.day.end};
 }
 visual(id){
  const i=id-1,event=this.day.byString[i]?.[this.counts[i]-1];
  return {...lightAt(this.last[i]??null,this.time,id),amplitude:event?.amplitude??0};
 }
}

export function lightAt(lastOnset,at,id){
 const elapsed=lastOnset===null?Infinity:at-lastOnset;
 const pulse=elapsed>=0?clamp(1-elapsed/4.25,0,1):0;
 const red=255*pulse,white=255*pulse;
 const green=clamp(200+36*Math.sin(at*1.3+id*2.3)+12*Math.sin(at*.37+id),0,255);
 const blue=15+5*Math.sin(at*1.7+id);
 return {pulse,red,white,green,blue,rgb:[red+white*.65,green+white*.65,blue+white*.65].map(v=>Math.round(clamp(v,0,255)))};
}

export function activityColor(count,scale){
 const stops=[[72,57,47],[210,233,166],[199,181,227],[242,140,109]];
 if(!count||!scale)return `rgb(${stops[0].join(',')})`;
 const t=clamp(count/scale,0,1)*3,index=Math.min(2,Math.floor(t));
 const a=stops[index],b=stops[index+1],u=t-index;
 return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*u)).join(',')})`;
}

export function formatClock(seconds){
 const s=Math.floor(clamp(seconds,0,86400));
 return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,'0')).join(':');
}

export function timelineCells(day){
 return day.bins.map((count,i)=>({start:day.start+i*120,end:Math.min(day.end,day.start+(i+1)*120),count,color:activityColor(count,day.scale)}));
}
