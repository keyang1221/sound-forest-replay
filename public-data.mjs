const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date;
export function publicSources(manifest){
 if(manifest?.version!==1||!Array.isArray(manifest.days))throw new Error('Unsupported published data manifest');
 return manifest.days.map(entry=>{
  if(!validDate(entry.date)||entry.url!==`./day-${entry.date}.json`)throw new Error('Invalid published data source');
  return {date:entry.date,url:entry.url,kind:'public',name:'Published interaction data'};
 });
}
export function decodePublicDay(payload){
 if(payload?.version!==1||!validDate(payload.date)||!Array.isArray(payload.events))throw new Error('Invalid published interaction data');
 const events=payload.events.map((e,sequence)=>{
  if(!Array.isArray(e)||e.length!==3||!Number.isInteger(e[0])||e[0]<0||e[0]>=86400||!Number.isInteger(e[1])||e[1]<1||e[1]>5||!Number.isFinite(e[2])||e[2]<0||e[2]>1)throw new Error('Invalid published trigger');
  return {t:e[0],stringId:e[1],amplitude:e[2],sequence};
 }).sort((a,b)=>a.t-b.t||a.sequence-b.sequence);
 return {date:payload.date,name:'Published interaction data',events,invalidRows:0};
}
