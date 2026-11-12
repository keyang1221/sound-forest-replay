export const DOT_RADIUS=5.2;
export function heatmapLayout(availableWidth,start,end){
 // Center spacing is2px tighter than the maximum dot diameter.
 const pitch=DOT_RADIUS*2-2,labelWidth=102,right=16,durationMinutes=(end-start)/60;
 const columns=Math.max(1,Math.floor((availableWidth-labelWidth-right)/pitch));
 const binMinutes=Math.max(2,Math.min(20,Math.ceil(durationMinutes/columns)));
 const binSeconds=binMinutes*60,binCount=Math.ceil((end-start)/binSeconds),plotWidth=binCount*pitch;
 const contentWidth=labelWidth+plotWidth+right,offset=Math.max(0,(availableWidth-contentWidth)/2);
 const labelScale=Math.max(.85,Math.min(1.5,Math.sqrt(availableWidth/700)));
 return {start,end,binMinutes,binSeconds,binCount,pitch,rowStep:pitch,plotWidth,contentWidth,offset,left:offset+labelWidth,width:Math.max(availableWidth,contentWidth),overflow:contentWidth>availableWidth,labelScale};
}
export const dotCenterX=(layout,bin)=>layout.left+(bin+.5)*layout.pitch;
// Every aggregate owns a full grid column. The final short interval still has
// equal dot spacing; tick positions inside it reflect its actual duration.
export function heatmapTimeX(layout,time){
 const {start,end,binSeconds,binCount,left,pitch}=layout;
 const t=Math.max(start,Math.min(end,time)),bin=Math.min(binCount-1,Math.floor((t-start)/binSeconds));
 const cellStart=start+bin*binSeconds,span=Math.min(binSeconds,end-cellStart);
 return left+(bin+(t-cellStart)/span)*pitch;
}

export function peakLayout(availableWidth,start,end){
 const width=availableWidth,left=Math.max(44,Math.min(76,width*.1)),right=16,plotWidth=Math.max(1,width-left-right);
 const hours=(end-start)/3600,tickHours=[1,2,3,4,6,12].find(step=>plotWidth/(hours/step)>=40)||12;
 const ticks=[];for(let t=start;t<end;t+=tickHours*3600)ticks.push(t);ticks.push(end);
 return {width,left,right,plotWidth,ticks};
}
