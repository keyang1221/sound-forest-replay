// A new outward gesture is required after reaching an edge or changing pages.
export class PageTurnGesture {
 constructor(){this.lastTime=-Infinity;this.armed=false;this.distance=0;this.blockedUntil=0;this.settling=false;this.lastConsumedTime=-Infinity;}
 reset(now){this.armed=false;this.distance=0;this.blockedUntil=now+800;this.lastTime=now;this.settling=true;this.lastConsumedTime=now;}
 consumeMomentum(now,transitioning){
  if(transitioning||(this.settling&&now-this.lastConsumedTime<300)){
   this.settling=true;this.lastConsumedTime=now;return true;
  }
  this.settling=false;return false;
 }
 push(delta,eligible,now){
  if(!(delta>0))return false;
  const fresh=now-this.lastTime>180;this.lastTime=now;
  if(now<this.blockedUntil||!eligible){this.armed=false;this.distance=0;return false;}
  if(fresh){this.armed=true;this.distance=0;}
  if(!this.armed)return false;
  this.distance+=delta;
  if(this.distance<72)return false;
  this.reset(now);return true;
 }
}
