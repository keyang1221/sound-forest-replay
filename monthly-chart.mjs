import {colorForCount,radiusForCount} from './activity.mjs';
import {monthlyLayout,monthlyScrollLeft,CALENDAR_WEEKDAYS} from './monthly.mjs';
const nf=new Intl.NumberFormat('en-US');

export function createMonthlyChart({svg,scroller,tooltip,slide}){
 let active=false,points=[],byDate=new Map(),selectedDate=null,mode=null,width=0,height=0,lastMaxScroll=0;
 function hideInspect(){tooltip.hidden=true;mode=null;const ring=svg.querySelector('#monthly-selected-cell');if(ring)ring.style.display='none';}
 function positionBubble(){
  const point=byDate.get(selectedDate);if(!active||!mode||!point)return;
  const box=svg.getBoundingClientRect(),visible=scroller.getBoundingClientRect(),x=box.left+point.x*box.width/width,y=box.top+point.y*box.height/height;
  if(x<visible.left||x>visible.right||y<0||y>innerHeight){hideInspect();return;}
  const size=tooltip.getBoundingClientRect(),left=Math.max(12,Math.min(innerWidth-size.width-12,x-size.width/2)),below=y-size.height-14<12;
  const top=below?y+14:y-size.height-14;
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(12,Math.min(innerHeight-size.height-12,top))}px`;
  tooltip.style.setProperty('--tip-x',`${Math.max(12,Math.min(size.width-12,x-left))}px`);tooltip.dataset.placement=below?'below':'above';
 }
 function inspect(nextMode){
  const point=byDate.get(selectedDate);if(!active||!point)return;
  if(nextMode==='keyboard'){
   const box=svg.getBoundingClientRect(),visible=scroller.getBoundingClientRect(),x=box.left+point.x*box.width/width,y=box.top+point.y*box.height/height;
   if(x<visible.left+8)scroller.scrollLeft-=visible.left+8-x;
   if(x>visible.right-8)scroller.scrollLeft+=x-visible.right+8;
   if(y<48)window.scrollBy({top:y-48});if(y>innerHeight-48)window.scrollBy({top:y-innerHeight+48});
  }
  const ring=svg.querySelector('#monthly-selected-cell'),extent=Math.max(3.5,point.halfSize+1.3);
  ring.style.display='';ring.setAttribute('x',point.x-extent);ring.setAttribute('y',point.y-extent);ring.setAttribute('width',extent*2);ring.setAttribute('height',extent*2);
  const status=point.status==='recorded'?`Full day · ${nf.format(point.count)} triggers`:point.status==='failed'?'Could not load logs':'No logs';
  tooltip.textContent=`${point.date.replaceAll('-',' / ')} · ${CALENDAR_WEEKDAYS[point.row]} · ${status}`;
  mode=nextMode;tooltip.hidden=false;positionBubble();
 }
 function draw(data,{preferredDate,preserveSelection=false}={}){
  const previousMode=mode;hideInspect();active=true;
  const layouts=data.years.map(year=>monthlyLayout(scroller.clientWidth,year));
  width=Math.max(scroller.clientWidth,...layouts.map(l=>l.width));height=layouts.reduce((sum,l)=>sum+l.height,0);
  const parts=[],fills=new Map();points=[];let top=0;
  function fill(color){
   if(!fills.has(color)){
    const id=`calendar-square-${color.slice(1)}`,layers=[];let previous=0;
    for(let i=0;i<=16;i++){
     const side=1-.4*i/16,target=.04+.96*i/16,opacity=i===16?1:(target-previous)/(1-previous);
     layers.push(`<rect x="${(1-side)/2}" y="${(1-side)/2}" width="${side}" height="${side}" fill="${color}" opacity="${opacity}"/>`);previous=target;
    }
    fills.set(color,`<pattern id="${id}" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox">${layers.join('')}</pattern>`);
   }
   return `url(#calendar-square-${color.slice(1)})`;
  }
  layouts.forEach((layout,index)=>{
   const shift=(width-layout.width)/2,labelX=shift+layout.offset;
   parts.push(`<text class="calendar-year" x="${labelX}" y="${top+18}">${data.years[index].year}</text>`);
   CALENDAR_WEEKDAYS.forEach((day,row)=>parts.push(`<text class="calendar-weekday" x="${labelX}" y="${top+42+row*layout.rowPitch+3}">${day}</text>`));
   for(const month of layout.months){
    parts.push(`<text class="calendar-month" x="${shift+month.x+month.width/2}" y="${top+18}" text-anchor="middle">${month.label}</text>`);
    for(const day of month.days){
     const x=shift+month.x+(day.column+.5)*layout.pitch,y=top+42+day.row*layout.rowPitch,halfSize=day.status==='recorded'?radiusForCount(day.count,data.quartiles,layout.pitch*.45):Math.max(1.2,layout.pitch*.14);
     const color=colorForCount(day.count,data.quartiles);
     points.push({...day,x,y,halfSize});
     parts.push(`<rect class="calendar-cell${day.status==='recorded'?'':` calendar-${day.status}`}" data-calendar-date="${day.date}" data-count="${day.count??''}" data-status="${day.status}" x="${x-halfSize}" y="${y-halfSize}" width="${halfSize*2}" height="${halfSize*2}" ${day.status==='recorded'?`fill="${fill(color)}" opacity="${day.count?1:.5}"`:'fill="none"'}/>`);
    }
   }
   top+=layout.height;
  });
  points.sort((a,b)=>a.date.localeCompare(b.date));byDate=new Map(points.map(p=>[p.date,p]));
  if(!preserveSelection||!byDate.has(selectedDate))selectedDate=byDate.has(preferredDate)?preferredDate:points.find(p=>p.status==='recorded')?.date||points[0]?.date;
  parts.push('<rect id="monthly-selected-cell" class="selected-cell" style="display:none"/>');
  svg.classList.add('monthly-chart');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=`${width}px`;svg.style.height=`${height}px`;
  svg.setAttribute('aria-label',`${data.years.map(y=>y.year).join(', ')}, January to December, Tuesday to Sunday, Mondays omitted. Monthly heatmap of full-day trigger totals across all five strings.`);
  svg.innerHTML=`<defs>${[...fills.values()].join('')}</defs>`+parts.join('');
  const maxScroll=Math.max(0,scroller.scrollWidth-scroller.clientWidth);slide.hidden=maxScroll<1;slide.max=maxScroll;
  scroller.classList.toggle('has-scroll-slide',!slide.hidden);
  scroller.scrollLeft=monthlyScrollLeft({previousLeft:scroller.scrollLeft,previousMax:lastMaxScroll,maxScroll,targetX:byDate.get(selectedDate)?.x||0,viewportWidth:scroller.clientWidth,preserveSelection});
  lastMaxScroll=maxScroll;
  slide.value=scroller.scrollLeft;
  if(preserveSelection&&previousMode==='keyboard')inspect('keyboard');
 }
 svg.addEventListener('pointermove',event=>{
  if(!active)return;
  const box=svg.getBoundingClientRect(),x=(event.clientX-box.left)*width/box.width,y=(event.clientY-box.top)*height/box.height;
  let hit=null,distance=Infinity;
  for(const point of points){const d=Math.max(Math.abs(point.x-x),Math.abs(point.y-y));if(d<distance){distance=d;hit=point;}}
  if(!hit||distance>Math.max(4,hit.halfSize+1)){hideInspect();return;}
  selectedDate=hit.date;inspect('pointer');
 });
 svg.addEventListener('pointerleave',()=>{if(active)hideInspect();});svg.addEventListener('blur',()=>{if(active)hideInspect();});
 svg.addEventListener('keydown',event=>{
  if(!active)return;
  if(event.key==='Escape'){hideInspect();return;}
  if(!points.length||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  let index=points.findIndex(p=>p.date===selectedDate);
  if(event.key==='Home')index=0;else if(event.key==='End')index=points.length-1;
  else if(event.key==='ArrowUp')index--;else if(event.key==='ArrowDown')index++;
  else{
   const target=new Date(`${selectedDate}T00:00:00Z`);target.setUTCDate(target.getUTCDate()+(event.key==='ArrowLeft'?-7:7));
   const found=points.findIndex(p=>p.date===target.toISOString().slice(0,10));if(found>=0)index=found;
  }
  selectedDate=points[Math.max(0,Math.min(points.length-1,index))].date;inspect('keyboard');
 });
 scroller.addEventListener('scroll',()=>{if(active){if(mode==='keyboard')positionBubble();else hideInspect();}},{passive:true});
 window.addEventListener('scroll',()=>{if(active){if(mode==='keyboard')positionBubble();else hideInspect();}},{passive:true});
 return {draw,hide(){active=false;hideInspect();svg.classList.remove('monthly-chart');}};
}
