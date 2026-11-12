import {nonzeroQuartiles,HISTORICAL_FLAGS} from './activity.mjs';
export const MONTH_LABELS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const CALENDAR_WEEKDAYS=['Tue','Wed','Thu','Fri','Sat','Sun'];

export function buildMonthlyDataset(rawDays,dates=rawDays.map(d=>d.date),failures=[]){
 const observed=new Map(rawDays.map(day=>[day.date,day.events.filter(e=>e.t>=0&&e.t<86400).length]));
 const failed=new Set(failures.map(f=>f.date));
 const years=[...new Set([...dates,...observed.keys(),...failed].map(d=>Number(d.slice(0,4))))].sort((a,b)=>b-a).map(year=>({year,months:MONTH_LABELS.map((label,month)=>{
  const first=new Date(Date.UTC(year,month,1)),offset=(first.getUTCDay()+6)%7,count=new Date(Date.UTC(year,month+1,0)).getUTCDate(),days=[];
  for(let day=1;day<=count;day++){
   const date=new Date(Date.UTC(year,month,day)).toISOString().slice(0,10),weekday=(offset+day-1)%7;
   if(weekday===0)continue;
   const recorded=observed.has(date);
   days.push({date,row:weekday-1,column:Math.floor((offset+day-1)/7),count:recorded?observed.get(date):null,status:recorded?'recorded':failed.has(date)?'failed':'missing',flag:HISTORICAL_FLAGS[date]||''});
  }
  return {month,label,weeks:Math.ceil((offset+count)/7),days};
 })}));
 const days=years.flatMap(y=>y.months.flatMap(m=>m.days));
 return {years,days,quartiles:nonzeroQuartiles(days.filter(d=>d.status==='recorded').map(d=>d.count))};
}

export function monthlyLayout(availableWidth,year){
 const labelWidth=74,right=12,maxGap=20;
 const columns=year.months.reduce((n,m)=>n+m.weeks,0);
 const pitch=Math.max(8,Math.min(16,(availableWidth-labelWidth-right-maxGap*11)/columns));
 // Zero extra gutter makes adjacent months use the same center spacing as days.
 const gap=Math.max(0,Math.min(maxGap,(availableWidth-labelWidth-right-columns*pitch)/11));
 const contentWidth=labelWidth+right+columns*pitch+gap*11,offset=Math.max(0,(availableWidth-contentWidth)/2),rowPitch=Math.max(14,pitch);
 let x=offset+labelWidth;
 const months=year.months.map(month=>{const width=month.weeks*pitch,result={...month,x,width};x+=width+gap;return result;});
 return {months,pitch,rowPitch,gap,offset,contentWidth,width:Math.max(availableWidth,contentWidth),height:42+5*rowPitch+28,overflow:contentWidth>availableWidth+1e-6};
}

export function monthlyScrollLeft({previousLeft,previousMax,maxScroll,targetX,viewportWidth,preserveSelection}){
 const next=!preserveSelection||previousMax<1?targetX-viewportWidth/2:previousLeft;
 return Math.max(0,Math.min(maxScroll,next));
}
