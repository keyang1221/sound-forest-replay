import {buildPickerData,pickerMonthCells,shiftPickerMonth,movePickerDate} from './date-picker-model.mjs';
const nf=new Intl.NumberFormat('en-US'),monthFormat=new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'});
const weekdays=['Tue','Wed','Thu','Fri','Sat','Sun'];
export function createHeatDatePicker({trigger,root,onSelect}){
 const $=id=>root.querySelector(`#${id}`),label=trigger.querySelector('span'),monthsNode=$('date-picker-months'),previous=$('date-picker-prev'),next=$('date-picker-next');
 let data=null,value='',cursor='',focusedDate='';
 const isOpen=()=>root.matches(':popover-open');
 const describe=entry=>!entry||entry.status==='missing'?'No logs':entry.status==='failed'?'Loading failed':`Full day: ${nf.format(entry.count)} triggers`;
 function position(){
  if(!isOpen())return;
  const anchor=trigger.getBoundingClientRect();
  if(anchor.bottom<0||anchor.top>innerHeight){close();return;}
  root.style.maxWidth=`${Math.max(0,document.documentElement.clientWidth-24)}px`;
  const box=root.getBoundingClientRect();
  root.style.left=`${Math.max(12,Math.min(document.documentElement.clientWidth-box.width-12,anchor.left))}px`;
  root.style.top=`${Math.max(12,Math.min(innerHeight-box.height-12,anchor.bottom+10))}px`;
 }
 function render(){
  const visibleDates=data.available.filter(date=>date.startsWith(cursor));
  if(!visibleDates.includes(focusedDate))focusedDate=visibleDates.includes(value)?value:visibleDates[0]||'';
  const cells=pickerMonthCells(data,cursor),rows=[];
  $('date-picker-month-title').textContent=monthFormat.format(new Date(`${cursor}-01T00:00:00Z`));
   for(let row=0;row<6;row++)rows.push(`<tr>${cells.slice(row*6,row*6+6).map(cell=>{
    if(!cell)return '<td></td>';
    const available=cell.status==='recorded',selected=cell.date===value,description=`${cell.date}, ${describe(cell)}`,background=available?(cell.count?cell.color:'#e9e6df'):'';
    return `<td><button type="button" data-picker-date="${cell.date}" data-total="${cell.count??''}" data-status="${cell.status}" class="date-picker-day${selected?' is-selected':''}" aria-label="${description}" aria-pressed="${selected}" title="${description}" tabindex="${cell.date===focusedDate?0:-1}" ${available?`style="--day-heat:${background}"`:'disabled'}>${Number(cell.date.slice(-2))}</button></td>`;
   }).join('')}</tr>`);
  monthsNode.innerHTML=`<table aria-labelledby="date-picker-month-title"><thead><tr>${weekdays.map(day=>`<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
 }
 function close(restoreFocus=false){
  if(isOpen())root.hidePopover();trigger.setAttribute('aria-expanded','false');
  if(restoreFocus)trigger.focus({preventScroll:true});
 }
 trigger.setAttribute('popovertarget',root.id);
 root.addEventListener('beforetoggle',event=>{
  trigger.setAttribute('aria-expanded',String(event.newState==='open'));
  if(event.newState!=='open')return;
  focusedDate=data.available.includes(value)?value:data.available.at(-1);cursor=focusedDate.slice(0,7);
  render();
 });
 previous.addEventListener('click',()=>{cursor=shiftPickerMonth(cursor,-1);render();position();});
 next.addEventListener('click',()=>{cursor=shiftPickerMonth(cursor,1);render();position();});
 root.addEventListener('toggle',()=>{
  trigger.setAttribute('aria-expanded',String(isOpen()));
  if(isOpen()){position();root.querySelector(`[data-picker-date="${focusedDate}"]`)?.focus({preventScroll:true});}
 });
 monthsNode.addEventListener('click',event=>{
  const button=event.target.closest('[data-picker-date]');if(!button||button.disabled)return;
  const selected=button.dataset.pickerDate;setValue(selected);close(true);onSelect(selected);
 });
 monthsNode.addEventListener('focusin',event=>{const button=event.target.closest('[data-picker-date]');if(button)focusedDate=button.dataset.pickerDate;});
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  const button=event.target.closest('[data-picker-date]');
  if(!button||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();focusedDate=movePickerDate(data.available,button.dataset.pickerDate,event.key);
  const month=focusedDate.slice(0,7);if(cursor!==month)cursor=month;
  render();position();root.querySelector(`[data-picker-date="${focusedDate}"]`)?.focus({preventScroll:true});
 });
 root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget)&&event.relatedTarget!==trigger)close();});
 window.addEventListener('resize',()=>{
  if(!isOpen())return;
  const hadDayFocus=document.activeElement?.matches('[data-picker-date]');
  render();position();
  if(hadDayFocus)root.querySelector(`[data-picker-date="${focusedDate}"]`)?.focus({preventScroll:true});
 });
 window.addEventListener('scroll',position,{passive:true});
 function setValue(date){
  const changed=date!==value;value=date;
  label.textContent=value?value.replaceAll('-',' / '):'Choose a date';
  trigger.setAttribute('aria-label',value?`Choose a date, currently ${value}`:'Choose a date');
  if(changed&&isOpen()){focusedDate=value;cursor=value.slice(0,7);render();position();}
 }
 return {load(rawDays,dates,failures){data=buildPickerData(rawDays,dates,failures);trigger.disabled=!data.available.length;},setValue,close};
}
