import {nonzeroQuartiles,colorForCount} from './activity.mjs';
const monthIndex=value=>{const [year,month]=value.split('-').map(Number);return year*12+month-1;};
const monthName=index=>`${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;
export const shiftPickerMonth=(month,step)=>monthName(monthIndex(month)+step);

export function buildPickerData(rawDays,dates=rawDays.map(d=>d.date),failures=[]){
 const counts=new Map(rawDays.map(day=>[day.date,day.events.filter(e=>e.t>=0&&e.t<86400).length]));
 const quartiles=nonzeroQuartiles([...counts.values()]),failed=new Set(failures.map(f=>f.date));
 const all=[...new Set([...dates,...counts.keys(),...failed])].sort();
 const entries=new Map(all.map(date=>{const recorded=counts.has(date),count=recorded?counts.get(date):null;return [date,{date,count,status:recorded?'recorded':failed.has(date)?'failed':'missing',color:recorded?colorForCount(count,quartiles):null}];}));
 return {entries,quartiles,available:[...counts.keys()].sort(),minMonth:all[0]?.slice(0,7),maxMonth:all.at(-1)?.slice(0,7)};
}
export function pickerMonthCells(data,month){
 const [year,m]=month.split('-').map(Number),offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7,last=new Date(Date.UTC(year,m,0)).getUTCDate();
 return Array.from({length:42},(_,index)=>{
  const n=index-offset+1;if(n<1||n>last)return null;
  const date=`${month}-${String(n).padStart(2,'0')}`;
  return data.entries.get(date)||{date,count:null,status:'missing',color:null};
 });
}
export function movePickerDate(available,current,key){
 if(!available.length)return null;
 const index=Math.max(0,available.indexOf(current));
 if(key==='ArrowLeft')return available[Math.max(0,index-1)];
 if(key==='ArrowRight')return available[Math.min(available.length-1,index+1)];
 if(key==='Home'||key==='End'){
  const month=available.filter(date=>date.startsWith(current.slice(0,7)));return key==='Home'?month[0]:month.at(-1);
 }
 const target=new Date(`${current}T00:00:00Z`);target.setUTCDate(target.getUTCDate()+(key==='ArrowUp'?-7:7));
 const date=target.toISOString().slice(0,10);
 return key==='ArrowUp'?(available.filter(d=>d<=date).at(-1)||available[0]):(available.find(d=>d>=date)||available.at(-1));
}
