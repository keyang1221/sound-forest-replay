export function fireflyParticles(count=72){
 return Array.from({length:count},(_,i)=>{
  const u=(i*.61803398875+.19)%1,v=(i*.754877666+.31)%1,w=(i*.569840291+.53)%1,low=i%8===7;
  return {x:2+u*96,y:low?56+Math.pow(v,1.8)*34:12+Math.pow(v,1.7)*34,
   size:low ? .75+w:1.8+w*3.6,alpha:low ? .1+w*.18:.28+w*.55,
   drift:(u-.5)*100,lift:(v-.5)*34,travel:low ? .45:1,halo:low ? .4:1,
   duration:25+v*30,delay:-u*67,blink:3.8+u*6.5,blinkDelay:-v*23,
   color:['#d7f58b','#ffe5a2','#e9f3ac'][i%3]};
 });
}
