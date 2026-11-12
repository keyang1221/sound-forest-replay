import {buildDataset,colorForCount,radiusForCount,buildMonotoneGeometry,calendarWeek,weekOptionLabel} from './activity.mjs';
import {formatClock} from './model.mjs';
import {heatmapLayout,heatmapTimeX,dotCenterX,peakLayout} from './heatmap-layout.mjs';
import {buildMonthlyDataset} from './monthly.mjs';
import {createMonthlyChart} from './monthly-chart.mjs';
import {createHeatDatePicker} from './date-picker.mjs';
const $=id=>document.getElementById(id),nf=new Intl.NumberFormat('en-US');
const clock=t=>formatClock(t).slice(0,5),weekdays=['Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const analysisStart=8*3600,analysisEnd=20*3600;
const weekLabel=start=>{const days=calendarWeek(start).slice(1);return `${days[0].replaceAll('-',' / ')} — ${days.at(-1).slice(5).replace('-',' / ')}`;};
export function createVisualization({loadData,getPreferredDate}){
 let rawDays=[],dates=[],dataset=null,monthlyData=null,date='',week='',period='week',request=null,ready=false;
 let selected={lane:0,bin:0},geometry=null,lastWidth=0,tooltipMode=null,inspectedDate=null,selectionAnchor=null,resizePending=false;
 const cache=new Map(),failures=new Set();
 const page=$('visualization-page'),svg=$('analysis-chart'),scroller=svg.parentElement,tooltip=$('analysis-inspect'),slide=$('analysis-scroll');
 const monthlyChart=createMonthlyChart({svg,scroller,tooltip,slide});
 const datePicker=createHeatDatePicker({trigger:$('analysis-date-trigger'),root:$('analysis-date-popover'),onSelect:selectDate});
 const switchState=(attribute,value)=>document.querySelectorAll(`[${attribute}]`).forEach(b=>{const active=b.getAttribute(attribute)===value;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 function recalculate(binSeconds){
  const key=binSeconds;
  if(!cache.has(key))cache.set(key,buildDataset(rawDays,analysisStart,analysisEnd,binSeconds));
  dataset=cache.get(key);
 }
 function hideInspect(){
  tooltip.hidden=true;tooltipMode=null;
  const ring=$('analysis-selected-cell');if(ring)ring.style.display='none';
 }
 function selectedPoint(){
  const {left,plotWidth,lanes,start,end,padding,layout,dots}=geometry,lane=lanes[selected.lane];
  if(!lane)return null;
  const cell=lane.row.cells[selected.bin],cx=dots?dotCenterX(layout,selected.bin):left+((cell.start+cell.end)/2-start)/(end-start)*plotWidth;
  const cy=lane.y-(!dots?cell.count/(dataset.quartiles.max||1)*padding:0);
  return {cell,cx,cy,lane,radius:dots?radiusForCount(cell.count,dataset.quartiles):2.8};
 }
 function positionBubble(){
  if(!geometry||!tooltipMode)return;
  const point=selectedPoint();if(!point){hideInspect();return;}
  const {cx,cy}=point,box=svg.getBoundingClientRect(),visible=scroller.getBoundingClientRect();
  const x=box.left+cx*box.width/geometry.width,y=box.top+cy*box.height/geometry.height;
  if(x<visible.left||x>visible.right||y<0||y>innerHeight){hideInspect();return;}
  const size=tooltip.getBoundingClientRect(),left=Math.max(12,Math.min(innerWidth-size.width-12,x-size.width/2));
  const below=y-size.height-14<12,top=below?y+14:y-size.height-14;
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(12,Math.min(innerHeight-size.height-12,top))}px`;
  tooltip.style.setProperty('--tip-x',`${Math.max(12,Math.min(size.width-12,x-left))}px`);
  tooltip.dataset.placement=below?'below':'above';
 }
 function inspect(mode){
  if(!geometry||!mode||!geometry.lanes.length){hideInspect();return;}
  selected.lane=Math.max(0,Math.min(geometry.lanes.length-1,selected.lane));
  selected.bin=Math.max(0,Math.min(geometry.binCount-1,selected.bin));
  const {cell,cx,cy,lane,radius}=selectedPoint();
  inspectedDate=lane.day.date;
  selectionAnchor={date:lane.day.date,stringId:lane.row.id,time:(cell.start+cell.end)/2};
  if(mode==='keyboard'){
   const box=svg.getBoundingClientRect(),visible=scroller.getBoundingClientRect(),x=box.left+cx*box.width/geometry.width;
   if(x<visible.left+8)scroller.scrollLeft-=visible.left+8-x;
   if(x>visible.right-8)scroller.scrollLeft+=x-visible.right+8;
   const y=box.top+cy*box.height/geometry.height;
   if(y<48)window.scrollBy({top:y-48});
   if(y>innerHeight-48)window.scrollBy({top:y-innerHeight+48});
  }
  const ring=$('analysis-selected-cell'),extent=radius+1.2;ring.style.display='';
  if(geometry.dots){ring.setAttribute('x',cx-extent);ring.setAttribute('y',cy-extent);ring.setAttribute('width',extent*2);ring.setAttribute('height',extent*2);}
  else{ring.setAttribute('cx',cx);ring.setAttribute('cy',cy);ring.setAttribute('r',extent);}
  tooltip.textContent=`${lane.day.date.replaceAll('-',' / ')} · String ${lane.row.id} · ${clock(cell.start)}–${clock(cell.end)} · ${nf.format(cell.count)} triggers`;
  tooltipMode=mode;tooltip.hidden=false;positionBubble();
 }
 function draw({preserveSelection=false}={}){
  if(!ready||page.hidden)return;
  datePicker.setValue(date);if(period!=='day')datePicker.close();
  const monthly=period==='month';
  $('weekly-method').hidden=period!=='week';$('daily-method').hidden=period!=='day';$('monthly-method').hidden=!monthly;
  if(monthly){
   lastWidth=scroller.clientWidth;
   $('analysis-week-control').hidden=true;$('analysis-date-control').hidden=true;
   $('analysis-status').hidden=true;
   const years=monthlyData.years.map(y=>y.year);
   $('analysis-date-heading').textContent=years.length===1?years[0]:`${years.at(-1)} — ${years[0]}`;
   $('analysis-keyboard').textContent='Use Up and Down to select adjacent dates, skipping Mondays, and Left and Right to move seven days. The tooltip shows the date and full-day total. Missing logs and loading failures are marked separately. Press Escape to hide the tooltip.';
   monthlyChart.draw(monthlyData,{preferredDate:date,preserveSelection});return;
  }
  monthlyChart.hide();
  const anchor=preserveSelection?selectionAnchor:null;
  hideInspect();if(!preserveSelection){inspectedDate=null;selectionAnchor=null;}
  lastWidth=scroller.clientWidth;
  const dots=period==='week',weekDates=calendarWeek(week).slice(1),start=analysisStart,end=analysisEnd;
  const layout=heatmapLayout(lastWidth,start,end),binSeconds=dots?layout.binSeconds:120,binCount=Math.ceil((end-start)/binSeconds);
  recalculate(binSeconds);$('analysis-grain').textContent=layout.binMinutes;
  $('analysis-week-control').hidden=!dots;$('analysis-date-control').hidden=dots;
  $('analysis-date-heading').textContent=dots?weekLabel(week):date.replaceAll('-',' / ');
  $('analysis-keyboard').textContent=dots?'Use Left and Right to select a time interval, and Up and Down to move through each day’s five strings. The tooltip shows the date, string, time range and trigger count. Press Escape to hide it.':'Use Left and Right to select a time interval, and Up and Down to select a string. The tooltip shows the date, string, time range and trigger count. Press Escape to hide it.';
  const dayMap=new Map(dataset.days.map(d=>[d.date,d])),day=dayMap.get(date);
  if(!dots&&!day){
   $('analysis-status').hidden=false;$('analysis-status').textContent=failures.has(date)?'Could not load logs for this date.':'No logs are available for this date.';
   svg.replaceChildren();svg.style.height='0px';slide.hidden=true;scroller.classList.remove('has-scroll-slide');geometry=null;return;
  }
  $('analysis-status').hidden=true;
  const peak=dots?null:peakLayout(lastWidth,start,end);
  const left=dots?layout.left:peak.left,right=dots?16:peak.right;
  const plotWidth=dots?layout.plotWidth:peak.plotWidth;
  const width=dots?layout.width:peak.width;
  const rowStep=14,firstRowY=34+17*layout.labelScale,bandHeight=firstRowY+4*rowStep+27,padding=64,height=dots?bandHeight*weekDates.length:516;
  const xFor=t=>dots?heatmapTimeX(layout,t):left+(t-start)/(end-start)*plotWidth,parts=[],lanes=[],dotFills=new Map();
  function dotFill(color){
   if(!dotFills.has(color)){
    const id=`analysis-dot-${color.slice(1)}`,layers=[];let previousOpacity=0;
    // Concentric square bands keep the opaque core and all fade contours square.
    for(let i=0;i<=16;i++){
     const side=1-.4*i/16,target=.04+.96*i/16;
     const opacity=i===16?1:(target-previousOpacity)/(1-previousOpacity);
     layers.push(`<rect x="${(1-side)/2}" y="${(1-side)/2}" width="${side}" height="${side}" fill="${color}" opacity="${opacity}"/>`);
     previousOpacity=target;
    }
    dotFills.set(color,`<pattern id="${id}" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox">${layers.join('')}</pattern>`);
   }
   return `url(#analysis-dot-${color.slice(1)})`;
  }
  const ticks=dots?Array.from({length:(end-start)/3600+1},(_,i)=>start+i*3600):peak.ticks;
  function axis(y){for(const t of ticks)parts.push(`<text class="hour-label" x="${xFor(t)}" y="${y}" text-anchor="${dots?'middle':t===start?'start':t===end?'end':'middle'}">${clock(t).slice(0,2)}</text>`);}
  if(dots){
   for(const [index,dayDate] of weekDates.entries()){
    const top=index*bandHeight,day=dayMap.get(dayDate),status=failures.has(dayDate)?'Loading failed':!day?'No logs':'';
    const dateY=top+17+17*layout.labelScale;
    axis(dateY);
    parts.push(`<text class="week-day" x="${layout.offset}" y="${top+17}">${weekdays[index]}</text><text class="week-date" x="${layout.offset}" y="${dateY}">${dayDate.replaceAll('-','.')}</text>`);
    for(let row=0;row<5;row++)parts.push(`<text class="week-row-label" x="${layout.offset}" y="${top+firstRowY+row*rowStep+3}">S${row+1}</text>`);
    if(status)parts.push(`<text class="week-status" x="${left+16}" y="${top+firstRowY+2*rowStep+3}">${status}</text>`);
    if(!day){parts.push(`<path class="missing-day" d="M${left+110*layout.labelScale} ${top+firstRowY+2*rowStep}H${left+plotWidth}"/>`);continue;}
    for(const [rowIndex,row] of day.series.entries()){
     const y=top+firstRowY+rowIndex*rowStep;lanes.push({day,row,y});
     for(const [bin,cell] of row.cells.entries()){
      const color=colorForCount(cell.count,dataset.quartiles),halfSize=radiusForCount(cell.count,dataset.quartiles);
      parts.push(`<rect data-date="${dayDate}" data-row="${rowIndex}" data-bin="${bin}" data-color="${color}" x="${dotCenterX(layout,bin)-halfSize}" y="${y-halfSize}" width="${halfSize*2}" height="${halfSize*2}" fill="${dotFill(color)}" opacity="${cell.count?1:.5}"/>`);
     }
    }
   }
  }else{
   axis(height-16);
   for(const [i,row] of day.series.entries()){
    const y=108+i*88;lanes.push({day,row,y});
    parts.push(`<text class="peak-row-label" x="4" y="${y-padding/2+4}">S${row.id}</text>`);
    parts.push(`<path class="peak-baseline" d="M${left} ${y}H${width-right}"/><text class="count-guide" x="${left-12}" y="${y+3}" text-anchor="end">0</text>`);
    if(dataset.quartiles.max)parts.push(`<path class="peak-guide" d="M${left} ${y-padding}H${width-right}"/><text class="count-guide" x="${left-12}" y="${y-padding+3}" text-anchor="end">${dataset.quartiles.max}</text>`);
    const points=row.cells.map(cell=>({x:xFor((cell.start+cell.end)/2),y:y-cell.count/(dataset.quartiles.max||1)*padding}));
    for(const segment of buildMonotoneGeometry(points).segments){const a=row.cells[segment.index].count,b=row.cells[segment.index+1].count;parts.push(`<path class="peak-segment" d="${segment.d}" stroke="${colorForCount((a+b)/2,dataset.quartiles)}"/>`);}
   }
  }
  geometry={width,height,left,plotWidth,start,end,binSeconds,binCount,lanes,padding,layout,dots};
  if(anchor){
   const lane=lanes.findIndex(l=>l.day.date===anchor.date&&l.row.id===anchor.stringId);
   selected.lane=lane<0?0:lane;selected.bin=Math.max(0,Math.min(binCount-1,Math.floor((anchor.time-start)/binSeconds)));
  }else{selected.lane=Math.max(0,Math.min(lanes.length-1,selected.lane));selected.bin=Math.max(0,Math.min(binCount-1,selected.bin));}
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=`${width}px`;svg.style.height=`${height}px`;
  for(const [name,size] of [['weekday',12],['date',10],['status',9]])svg.style.setProperty(`--analysis-${name}-size`,`${size*layout.labelScale}px`);
  svg.dataset.binMinutes=binSeconds/60;
  svg.setAttribute('aria-label',dots?`${weekDates[0]} to ${weekDates.at(-1)}, ${clock(start)}–${clock(end)}, five strings per day, Tuesday to Sunday. Weekly heatmap with ${layout.binMinutes}-minute trigger totals.`:`${date}, ${clock(start)}–${clock(end)}. Daily curves of two-minute trigger totals for five strings.`);
  parts.push(dots?'<rect class="selected-cell" id="analysis-selected-cell" style="display:none"/>':'<circle class="selected-cell" id="analysis-selected-cell" r="4" style="display:none"/>');
  svg.innerHTML=(dotFills.size?`<defs>${[...dotFills.values()].join('')}</defs>`:'')+parts.join('');
  const maxScroll=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
  slide.hidden=!dots||!layout.overflow||maxScroll<1;slide.max=maxScroll;slide.value=scroller.scrollLeft;
  scroller.classList.toggle('has-scroll-slide',!slide.hidden);
 }
 async function show(){
  if(ready){draw();return;}
  if(request)return request;
  request=(async()=>{
   try{
    const result=await loadData();rawDays=result.days;dates=result.dates||rawDays.map(d=>d.date);
    for(const failure of result.failures||[])failures.add(failure.date);
    monthlyData=buildMonthlyDataset(rawDays,dates,result.failures||[]);
    datePicker.load(rawDays,dates,result.failures||[]);
    date=dates.includes(getPreferredDate())?getPreferredDate():dates.at(-1)||'';
    if(!dates.length){$('analysis-status').textContent='No available log source is connected.';request=null;return;}
    week=calendarWeek(date)[0];
    const options=(values,label)=>values.map(d=>{const o=document.createElement('option');o.value=d;o.textContent=label(d);return o;});
    $('analysis-date').replaceChildren(...options(dates,d=>d.replaceAll('-',' / ')));$('analysis-date').value=date;$('analysis-date').disabled=false;
    $('analysis-week').replaceChildren(...options([...new Set(dates.map(d=>calendarWeek(d)[0]))],weekOptionLabel));$('analysis-week').value=week;$('analysis-week').disabled=false;
    ready=true;draw();
   }catch(error){$('analysis-status').textContent=`Could not load logs: ${error.message}`;request=null;}
  })();return request;
 }
 function selectDate(value){
  if(!dates.includes(value))return;
  date=value;$('analysis-date').value=date;week=calendarWeek(date)[0];$('analysis-week').value=week;selected={lane:0,bin:0};draw();
 }
 $('analysis-date').addEventListener('change',()=>selectDate($('analysis-date').value));
 $('analysis-week').addEventListener('change',()=>{
  week=$('analysis-week').value;
  if(!calendarWeek(week).includes(date)){date=dates.find(d=>calendarWeek(week).includes(d))||week;$('analysis-date').value=date;}
  selected={lane:0,bin:0};draw();
 });
 document.querySelectorAll('[data-analysis-period]').forEach(b=>b.addEventListener('click',()=>{
  if(period===b.dataset.analysisPeriod)return;
  if(period==='week'&&b.dataset.analysisPeriod==='day'&&inspectedDate){date=inspectedDate;$('analysis-date').value=date;}
  period=b.dataset.analysisPeriod;switchState('data-analysis-period',period);
  hideInspect();if(period!=='month')scroller.scrollLeft=0;
  if(period==='day')selected={lane:0,bin:0};
  if(ready)draw({preserveSelection:period==='week'});
 }));
 svg.addEventListener('pointermove',event=>{
  if(period==='month')return;
  if(!geometry||!geometry.lanes.length)return;
  const box=svg.getBoundingClientRect(),x=(event.clientX-box.left)*geometry.width/box.width,y=(event.clientY-box.top)*geometry.height/box.height;
  if(x<geometry.left||x>geometry.left+geometry.plotWidth){hideInspect();return;}
  const bin=Math.max(0,Math.min(geometry.binCount-1,Math.floor(geometry.dots?(x-geometry.left)/geometry.layout.pitch:(x-geometry.left)/geometry.plotWidth*(geometry.end-geometry.start)/geometry.binSeconds)));
  let distance=Infinity;
  geometry.lanes.forEach((lane,index)=>{
   for(let b=Math.max(0,bin-1);b<=Math.min(geometry.binCount-1,bin+1);b++){
    const cell=lane.row.cells[b],pointX=geometry.dots?dotCenterX(geometry.layout,b):geometry.left+((cell.start+cell.end)/2-geometry.start)/(geometry.end-geometry.start)*geometry.plotWidth;
    const pointY=lane.y-(!geometry.dots?cell.count/(dataset.quartiles.max||1)*geometry.padding:0),d=Math.hypot(pointX-x,pointY-y);
    if(d<distance){distance=d;selected.lane=index;selected.bin=b;}
   }
  });
  const point=selectedPoint(),tolerance=(geometry.dots?Math.max(4,point.radius+1):9)*geometry.width/box.width;
  const hitDistance=geometry.dots?Math.max(Math.abs(point.cx-x),Math.abs(point.cy-y)):Math.hypot(point.cx-x,point.cy-y);
  if(hitDistance>tolerance){hideInspect();return;}
  inspect('pointer');
 });
 svg.addEventListener('pointerleave',()=>{if(period!=='month')hideInspect();});svg.addEventListener('blur',()=>{if(period!=='month')hideInspect();});
 // Clicking a point must not scroll the tall weekly SVG into focus or open a
 // bubble for an unrelated row. Keyboard lookup starts with the arrow keys.
 svg.addEventListener('mousedown',event=>{if(event.button===0)event.preventDefault();});
 slide.addEventListener('input',()=>{scroller.scrollLeft=Number(slide.value);});
 scroller.addEventListener('scroll',()=>{slide.value=scroller.scrollLeft;if(period==='month')return;if(tooltipMode==='keyboard')positionBubble();else hideInspect();},{passive:true});
 window.addEventListener('scroll',()=>{if(period==='month')return;if(tooltipMode==='keyboard')positionBubble();else hideInspect();},{passive:true});
 svg.addEventListener('keydown',event=>{
  if(period==='month')return;
  if(event.key==='Escape'){hideInspect();return;}
  if(!geometry||!geometry.lanes.length||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  if(event.key==='ArrowLeft')selected.bin--;if(event.key==='ArrowRight')selected.bin++;
  if(event.key==='ArrowUp')selected.lane--;if(event.key==='ArrowDown')selected.lane++;
  if(event.key==='Home')selected.bin=0;if(event.key==='End')selected.bin=geometry.binCount-1;
  inspect('keyboard');
 });
 new ResizeObserver(()=>{
  if(page.hidden||scroller.clientWidth===lastWidth||resizePending)return;
  resizePending=true;requestAnimationFrame(()=>{resizePending=false;if(!page.hidden&&scroller.clientWidth!==lastWidth)draw({preserveSelection:true});});
 }).observe(scroller);
 return {show,hide(){datePicker.close();monthlyChart.hide();hideInspect();}};
}
