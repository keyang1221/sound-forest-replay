import {parseLog,prepareDay,Replay,lightAt,activityColor,formatClock,timelineCells,peakStart} from './model.mjs';
import {layoutScene,scrollScene} from './scene.mjs';
import {createVisualization} from './visualization.mjs';
import {fireflyParticles} from './fireflies.mjs';
import {PageTurnGesture} from './page-turn.mjs';
import {publicSources,decodePublicDay} from './public-data.mjs';

// A fresh visit always begins with the overhead camera, including on refresh.
history.scrollRestoration='manual';
window.scrollTo(0,0);

const $=id=>document.getElementById(id),nf=new Intl.NumberFormat('en-US');
const sources=new Map(),loaded=new Map(),lanes=[];
let engine=null,playing=false,speed=1,loadToken=0,lastFrame=0;
let entryStarted=false,scrollPending=true,cameraProgress=0,controlsProgress=0;
let activePage='replay',routeReady=false,resumeReplay=false,replayScroll=0;
let dragResume=false,isDragging=false,noticeTimer;
const pulses=Array(5).fill(-Infinity),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const speedSteps=[1,50,200,2000];
let ropeHeight=200;
const svgNS='http://www.w3.org/2000/svg';

// Ambient fireflies use a stable, top-heavy distribution, independent of logs.
const particleField=document.createDocumentFragment();
for(const p of fireflyParticles()){
 const particle=document.createElement('span');
 particle.style.cssText=`--x:${p.x.toFixed(3)}%;--y:${p.y.toFixed(3)}%;--size:${p.size.toFixed(2)}px;--alpha:${p.alpha.toFixed(3)};--drift:${p.drift.toFixed(2)}px;--lift:${p.lift.toFixed(2)}px;--travel:${p.travel};--halo:${p.halo};--duration:${p.duration.toFixed(2)}s;--delay:${p.delay.toFixed(2)}s;--blink:${p.blink.toFixed(2)}s;--blink-delay:${p.blinkDelay.toFixed(2)}s;color:${p.color}`;
 particleField.append(particle);
}
$('ambient-particles').append(particleField);

for(const id of [5,4,3,2,1]){
 const lane=document.createElementNS(svgNS,'g');lane.setAttribute('class','string-lane');lane.dataset.string=id;
 lane.innerHTML=`<ellipse class="platform-shadow"/><ellipse class="platform-light"/><path class="platform-side"/><ellipse class="platform"/><ellipse class="platform-edge"/><circle class="rope-attachment" r="1.8"/><path class="rope-line rope-outer"/><path class="rope-line rope-main"/><path class="rope-line rope-highlight"/>`;
 $('space-scene').append(lane);
 lanes.push({id,node:lane,paths:[...lane.querySelectorAll('.rope-line')]});
}

function positionStage(){
 const {width,height}=$('strings').getBoundingClientRect();if(!width||!height)return;
 const layout=layoutScene(width,height,cameraProgress,1.3,{circleScale:.8,ropeLengthScale:2/3});ropeHeight=layout.ropeHeight;
 $('space-scene').setAttribute('viewBox',`0 0 ${width} ${height}`);
 for(const point of layout.items){
  const lane=lanes.find(l=>l.id===point.id),r=point.radius,ry=r*layout.ellipseRatio,d=layout.thickness;
  lane.node.setAttribute('transform',`translate(${point.x} ${point.y}) scale(${layout.objectScale})`);
  const ellipse=(selector,rx,ry,cy=0)=>{const e=lane.node.querySelector(selector);e.setAttribute('cx',0);e.setAttribute('cy',cy);e.setAttribute('rx',rx);e.setAttribute('ry',ry);};
  ellipse('.platform-shadow',r*1.22,ry*1.22);ellipse('.platform-light',r*1.34,ry*1.35);
  ellipse('.platform',r,ry);ellipse('.platform-edge',r*.88,ry*.88);
  lane.node.querySelector('.platform-side').setAttribute('d',`M${-r} 0 A${r} ${ry} 0 0 0 ${r} 0 L${r} ${d} A${r} ${ry} 0 0 1 ${-r} ${d} Z`);
  lane.node.querySelector('.rope-attachment').setAttribute('cy',-ropeHeight-3);
  $('space-scene').append(lane.node);
 }
 render(performance.now());
}

function scrollExtent(){
 return Math.max(0,$('scroll-experience').offsetHeight-document.querySelector('main').getBoundingClientRect().height);
}
function updateScroll(){
 const section=$('scroll-experience'),rect=section.getBoundingClientRect();
 const next=scrollScene(Math.max(0,-rect.top),scrollExtent());
 cameraProgress=next.camera;controlsProgress=next.controls;
 document.documentElement.style.setProperty('--camera-progress',cameraProgress);
 document.documentElement.style.setProperty('--controls-progress',controlsProgress);
 // The arrow and native date picker share one morphing surface.
 const dateReady=controlsProgress>.95;
 $('date-picker-controls').inert=!dateReady;
 $('player-dock').classList.toggle('date-ready',dateReady);
 $('show-controls').inert=dateReady;
 $('show-controls').tabIndex=dateReady?-1:0;
 positionStage();
 scrollPending=false;
}

function notify(message,error=false){
 clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=false;
 if(!error)noticeTimer=setTimeout(()=>$('notice').hidden=true,8000);
}
function setPlaying(value){
 playing=Boolean(value&&engine);lastFrame=0;
 $('play-label').textContent=playing?'Pause':'Play';$('play-icon').textContent=playing?'Ⅱ':'▶';
 $('play').setAttribute('aria-label',playing?'Pause':'Play');
 $('playback-status').textContent=playing?'Playing':engine?'Paused':'Waiting for data';
 if(!playing)pulses.fill(-Infinity);
}
function nextReplaySpeed(){return speedSteps.find(value=>value>speed)??speedSteps[0];}
function setSpeed(value){
 if(!Number.isFinite(value))return;
 speed=Math.round(Math.max(1,Math.min(2000,value)));
 $('speed-cycle').textContent=`×${speed}`;
 $('speed-cycle').setAttribute('aria-label',`Change playback speed, currently ${speed}×`);
 $('speed-cycle').title=`Currently ${speed}×; click to switch to ${nextReplaySpeed()}×`;
 $('frame-label').textContent=speed>=30?'High speed · triggers in the same frame are combined':'Individual triggers · second-level timestamps';
}
function rebuild(){
 const day=loaded.get($('day-select').value);if(!day)return;
 setPlaying(false);pulses.fill(-Infinity);
 const bounds=[36000,61200];
 engine=new Replay(prepareDay(day,...bounds));
 const autoEntry=!entryStarted&&engine.day.events.length>0;
 engine.seek((autoEntry?peakStart(engine.day):engine.day.events[0]?.t)??engine.day.start);
 setPlaying(false);
 $('timeline').min=bounds[0];$('timeline').max=bounds[1];
 $('window-label').textContent=`${formatClock(bounds[0]).slice(0,5)} — ${formatClock(bounds[1]).slice(0,5)}`;
 $('total-count').textContent=nf.format(engine.day.events.length);
 $('window-empty').hidden=engine.day.events.length>0;
 $('empty-state').hidden=true;
 const formatter=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'});
 $('session-date').textContent=day.date.replaceAll('-',' / ');
 $('session-date').setAttribute('datetime',day.date);
 $('session-date').title=formatter.format(new Date(day.date+'T12:00:00Z'));
 $('date-note').textContent=`${nf.format(day.events.length)} log entries · 5 strings`;
 $('source-label').textContent=sources.get(day.date)?.kind==='public'?'Published interaction data':'Local files · read on this device only';
 ['play','speed-cycle','timeline'].forEach(id=>$(id).disabled=false);
 drawTimeline();render(performance.now());
 if(autoEntry){entryStarted=true;setSpeed(1);if(activePage==='replay')setPlaying(true);else resumeReplay=true;}
}
function updateDateSelect(preferred){
 const dates=[...sources.keys()].sort();const old=$('day-select').value;
 $('day-select').replaceChildren(...dates.map(date=>{const option=document.createElement('option');option.value=date;option.textContent=date.replaceAll('-',' / ');return option;}));
 $('day-select').disabled=dates.length===0;
 $('day-select').value=dates.includes(preferred)?preferred:dates.includes(old)?old:dates.at(-1)||'';
}
async function selectDay(date){
 const token=++loadToken;setPlaying(false);
 $('playback-status').textContent='Loading logs…';['play','speed-cycle','timeline'].forEach(id=>$(id).disabled=true);
 try{
  const day=await loadDay(date);
  if(token!==loadToken)return;
  rebuild();
  if(day.invalidRows)notify(`Skipped ${nf.format(day.invalidRows)} invalid records.`,true);
 }catch(error){if(token===loadToken){$('playback-status').textContent='Loading failed';notify(error.message,true);}}
}
async function loadDay(date){
 if(loaded.has(date))return loaded.get(date);
 const source=sources.get(date);if(!source)throw new Error('Logs are not connected');
 const response=await fetch(source.url,{cache:'no-store'});if(!response.ok)throw new Error('Could not load logs for this date');
 const result=source.kind==='public'?{days:[decodePublicDay(await response.json())],invalidRows:0}:parseLog(await response.text(),source.name),day=result.days.find(d=>d.date===date);
 if(!day)throw new Error('No valid logs for this date were found in the file');
 const reviewed={...day,invalidRows:result.invalidRows};loaded.set(date,reviewed);return reviewed;
}
function drawTimeline(){
 const canvas=$('timeline-colors'),rect=canvas.getBoundingClientRect(),ratio=devicePixelRatio||1;
 canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio));
 const ctx=canvas.getContext('2d');const bins=engine?.day.bins||[0],scale=engine?.day.scale||0;
 ctx.fillStyle=activityColor(0,scale);ctx.fillRect(0,0,canvas.width,canvas.height);
 if(engine)for(const cell of timelineCells(engine.day)){
  const x=Math.round((cell.start-engine.day.start)/(engine.day.end-engine.day.start)*canvas.width);
  const end=Math.round((cell.end-engine.day.start)/(engine.day.end-engine.day.start)*canvas.width);
  ctx.fillStyle=cell.color;ctx.fillRect(x,0,end-x,canvas.height);
 }
 const start=engine?.day.start??36000,end=engine?.day.end??61200,step=3600;
 const ticks=[];for(let t=start;t<=end;t+=step){const span=document.createElement('span');span.textContent=formatClock(t).slice(0,5);span.style.left=`${(t-start)/(end-start)*100}%`;ticks.push(span);}
 $('timeline-ticks').replaceChildren(...ticks);
}
function render(wallTime){
 const time=engine?.time??36000;
 const clock=formatClock(time);$('current-time').innerHTML=`${clock.slice(0,5)}<span>${clock.slice(5)}</span>`;
 if(engine){
  $('timeline').value=time;$('timeline').setAttribute('aria-valuetext',clock);
  $('playhead').style.left=`${(time-engine.day.start)/(engine.day.end-engine.day.start)*100}%`;
  $('played-count').textContent=nf.format(engine.counts.reduce((a,b)=>a+b,0));
 }
 for(const lane of lanes){
  const id=lane.id-1,last=engine?.last[id]??null;
  let light=engine?engine.visual(lane.id):lightAt(last,time,lane.id);
  const amplitude=light.amplitude??0;
  const displayPulse=playing&&speed>=30?Math.max(0,1-(wallTime-pulses[id])/100):0;
  if(displayPulse>light.pulse){const fresh=lightAt(time,time,lane.id);light={...fresh,pulse:displayPulse};}
  lane.node.style.setProperty('--rope-color',`rgb(${light.rgb.join(',')})`);
  lane.node.style.setProperty('--glow',light.pulse.toFixed(3));
  const swing=reduced.matches?0:Math.sin(time*6+lane.id)*light.pulse*(1.1+Math.min(1,Math.sqrt(amplitude)*3)*3);
  const path=`M0 ${-ropeHeight} C${swing} ${-ropeHeight*.724},${-swing*1.7} ${-ropeHeight*.339},0 0`;
  lane.paths.forEach(p=>p.setAttribute('d',path));
 }
}
function frame(now){
 if(scrollPending)updateScroll();
 if(playing&&engine){
  if(lastFrame){
   const update=engine.advance((now-lastFrame)/1000,speed);
   for(const event of update.fired)pulses[event.stringId-1]=now;
   if(update.done){setPlaying(false);$('playback-status').textContent='Replay ended';}
  }
  lastFrame=now;render(now);
 }
 requestAnimationFrame(frame);
}

window.addEventListener('scroll',()=>{scrollPending=true;},{passive:true});
window.addEventListener('resize',()=>{scrollPending=true;});
$('show-controls').addEventListener('click',()=>{
 const section=$('scroll-experience');
 window.scrollTo({top:section.offsetTop+scrollExtent(),behavior:reduced.matches?'instant':'smooth'});
});

$('play').addEventListener('click',()=>{if(engine?.time>=engine?.day.end)engine.seek(engine.day.events[0]?.t??engine.day.start);setPlaying(!playing);render(performance.now());});
$('speed-cycle').addEventListener('click',()=>setSpeed(nextReplaySpeed()));
$('day-select').addEventListener('change',()=>selectDay($('day-select').value));
$('timeline').addEventListener('pointerdown',()=>{isDragging=true;dragResume=playing;setPlaying(false);});
function finishDrag(){if(isDragging){isDragging=false;setPlaying(dragResume);dragResume=false;}}
window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',()=>{dragResume=false;finishDrag();});
$('timeline').addEventListener('input',()=>{if(engine){engine.seek(Number($('timeline').value));pulses.fill(-Infinity);lastFrame=0;render(performance.now());}});
$('timeline-wrap').addEventListener('pointermove',event=>{
 if(!engine)return;const rect=event.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,event.clientX-rect.left));
 const i=Math.min(engine.day.bins.length-1,Math.floor(x/rect.width*engine.day.bins.length));
 const output=$('timeline-tooltip');output.hidden=false;output.style.left=`${Math.max(65,Math.min(rect.width-65,x))}px`;
 output.textContent=`${formatClock(engine.day.start+i*120).slice(0,5)} · ${nf.format(engine.day.bins[i])} triggers / 2 min`;
});
$('timeline-wrap').addEventListener('pointerleave',()=>$('timeline-tooltip').hidden=true);
document.addEventListener('keydown',event=>{if(activePage==='replay'&&event.code==='Space'&&!/INPUT|SELECT|TEXTAREA|BUTTON|A/.test(event.target.tagName)&&engine){event.preventDefault();$('play').click();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)setPlaying(false);});

new ResizeObserver(drawTimeline).observe($('timeline-wrap'));
new ResizeObserver(()=>{scrollPending=true;}).observe($('strings'));
new ResizeObserver(()=>{
 document.documentElement.style.setProperty('--dock-height',`${$('player-dock').getBoundingClientRect().height}px`);
}).observe($('player-dock'));
positionStage();
setSpeed(speed);drawTimeline();render(performance.now());requestAnimationFrame(frame);

async function boot(){
 try{
  let manifest=null;
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
   const response=await fetch('./__local/manifest',{cache:'no-store'});
   if(response.ok){const entries=await response.json();if(entries.length)manifest=entries.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&/^\/[\w/.-]+$/.test(e.url)).map(e=>({...e,kind:'local'}));}
  }
  if(!manifest){
   const response=await fetch('./data-manifest.json',{cache:'no-store'});
   if(!response.ok)throw new Error('Published interaction data is not available');
   manifest=publicSources(await response.json());
  }
  for(const entry of manifest)sources.set(entry.date,entry);
  if(sources.size){updateDateSelect(sources.has('2026-11-03')?'2026-11-03':undefined);await selectDay($('day-select').value);}
 }catch(error){notify(error.message||'Interaction data is not available. Please try refreshing the page.');}
}
const bootReady=boot();
const visualization=createVisualization({
 getPreferredDate:()=>$('day-select').value,
 loadData:async()=>{
  await bootReady;
  const dates=[...sources.keys()].sort(),results=await Promise.allSettled(dates.map(loadDay)),days=[],failures=[];
  results.forEach((result,i)=>{if(result.status==='fulfilled')days.push(result.value);else failures.push({date:dates[i],reason:result.reason.message});});
  return {dates,days,failures};
 }
});
const pageTurnGesture=new PageTurnGesture();
let turningPage=false;
function showPage(page,{atReplayEnd=false}={}){
 if(routeReady&&activePage===page)return;
 const changingPage=routeReady;
 if(activePage==='visualization'&&page!=='visualization')visualization.hide();
 if(activePage==='replay'&&page!=='replay'){replayScroll=window.scrollY;resumeReplay=playing;setPlaying(false);}
 activePage=page;routeReady=true;
 $('scroll-experience').hidden=page!=='replay';$('visualization-page').hidden=page!=='visualization';
 document.querySelectorAll('[data-page]').forEach(link=>{if(link.dataset.page===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 window.scrollTo(0,page==='replay'?(atReplayEnd?scrollExtent():replayScroll):0);scrollPending=true;
 if(changingPage)pageTurnGesture.reset(performance.now());
 if(page==='visualization')visualization.show();else if(engine)setPlaying(resumeReplay);
}
const pageFromHash=()=>location.hash==='#visualization'?'visualization':'replay';
document.querySelectorAll('[data-page]').forEach(link=>link.addEventListener('click',event=>{
 event.preventDefault();navigateTo(link.dataset.page);
}));
window.addEventListener('hashchange',()=>showPage(pageFromHash()));
window.addEventListener('popstate',()=>showPage(pageFromHash()));
showPage(pageFromHash());


async function navigateTo(page,{atReplayEnd=false}={}){
 if(turningPage||page===activePage)return;
 turningPage=true;pageTurnGesture.reset(performance.now());
 document.documentElement.dataset.pageDirection=page==='visualization'?'forward':'backward';
 const update=()=>{
  if(location.hash!==`#${page}`)history.pushState(null,'',`#${page}`);
  showPage(page,{atReplayEnd});
 };
 try{
  if(!reduced.matches&&document.startViewTransition){
   const transition=document.startViewTransition(update);
   await transition.finished.catch(()=>{});
  }else{
   update();
   if(!reduced.matches){
    const shift=page==='visualization'?innerHeight:-innerHeight;
    await document.body.animate([{transform:`translateY(${shift}px)`},{transform:'translateY(0)'}],{duration:650,easing:'cubic-bezier(.22,.75,.2,1)'}).finished.catch(()=>{});
   }
  }
 }finally{turningPage=false;}
}
const ignorePageTurn=target=>target.closest('button,input,select,textarea,a,[contenteditable="true"],[role="slider"]')||$('analysis-date-popover').matches(':popover-open');
function outwardPage(delta){
 if(activePage==='replay'&&delta>0&&window.scrollY>=scrollExtent()-2)return 'visualization';
 if(activePage==='visualization'&&delta<0&&window.scrollY<=1)return 'replay';
 return null;
}
window.addEventListener('wheel',event=>{
 if(event.ctrlKey||event.defaultPrevented||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
 const now=performance.now();
 if(pageTurnGesture.consumeMomentum(now,turningPage)){event.preventDefault();return;}
 if(ignorePageTurn(event.target))return;
 const page=outwardPage(event.deltaY),amount=Math.abs(event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
 if(pageTurnGesture.push(amount,Boolean(page),now)){
  event.preventDefault();navigateTo(page,{atReplayEnd:page==='replay'});
 }
},{passive:false});
let pageTouch=null;
window.addEventListener('touchstart',event=>{
 if(event.touches.length!==1||ignorePageTurn(event.target)){pageTouch=null;return;}
 const touch=event.touches[0];
 pageTouch={x:touch.clientX,y:touch.clientY,page:activePage,forward:outwardPage(1),backward:outwardPage(-1)};
},{passive:true});
window.addEventListener('touchmove',event=>{
 if(!pageTouch||event.touches.length!==1)return;
 const touch=event.touches[0],dy=pageTouch.y-touch.clientY,dx=pageTouch.x-touch.clientX;
 const page=dy>0?pageTouch.forward:pageTouch.backward;
 if(!page||pageTouch.page!==activePage||Math.abs(dx)>Math.abs(dy)||Math.abs(dy)<64)return;
 event.preventDefault();pageTouch=null;
 if(!turningPage)navigateTo(page,{atReplayEnd:page==='replay'});
},{passive:false});
window.addEventListener('touchend',()=>{pageTouch=null;},{passive:true});
window.addEventListener('touchcancel',()=>{pageTouch=null;},{passive:true});
