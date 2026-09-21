import {angleDelta} from './motion.mjs';
import {clamp} from './senses.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const similarity=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length?
  a.reduce((sum,v,i)=>sum+v*b[i],0):0;

export function endPurpose(s,reason,delay=3){
  if(s.purpose){
    s.lastPurpose={kind:s.purpose.kind,reason,time:s.age};
    if(s.purpose.kind==='inspect')s.recentChecks.push({x:s.purpose.target.x,y:s.purpose.target.y,until:s.age+15});
  }
  s.purpose=null;s.nextExploreAt=s.age+delay;
}

// A small engineering coordinator. It receives image-derived regions, never sugar locations.
export function updatePurpose(s,observation,bounds,random,dt,now=Date.now()){
  if(s.age>=s.nextVisitAt){
    const key=`${Math.floor(s.x/80)},${Math.floor(s.y/80)}`;
    s.visits=s.visits.filter(v=>s.age-v.time<90);
    let cell=s.visits.find(v=>v.key===key);
    if(cell){cell.time=s.age;cell.count=Math.min(12,cell.count+1);}else s.visits.push({key,time:s.age,count:1});
    s.visits=s.visits.slice(-128);s.nextVisitAt=s.age+.5;
  }
  s.recentChecks=s.recentChecks.filter(c=>c.until>s.age).slice(-16);
  if(s.age<s.flightUntil||s.age<=s.threatUntil||s.fatigue>=.9){
    if(s.purpose)endPurpose(s,s.fatigue>=.9?'疲劳，结束当前目的':'威胁打断，重新观察',2);
    return {active:false};
  }
  const enabled=s.visionEnabled&&s.visualSteeringEnabled;
  const fresh=enabled&&observation?.source==='desktop'&&observation.available&&
    now>=observation.capturedAt&&now-observation.capturedAt<1000;
  const candidates=fresh?(observation.regions??[]).filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&
    Number.isFinite(c.score)&&c.x>=bounds.x&&c.x<=bounds.x+bounds.width&&c.y>=bounds.y&&c.y<=bounds.y+bounds.height):[];
  if(s.purpose?.kind==='inspect'&&!enabled)endPurpose(s,'视觉转向关闭',2);
  const newFrame=fresh&&s.lastRegionStamp!==observation.capturedAt;
  if(newFrame){
    s.lastRegionStamp=observation.capturedAt;
    if(s.purpose?.kind==='inspect'){
      const goal=s.purpose;
      const match=candidates.filter(c=>distance(c,goal.target)<Math.max(70,c.radius+goal.target.radius)&&similarity(c.descriptor,goal.target.descriptor)>.55)
        .sort((a,b)=>distance(a,goal.target)-distance(b,goal.target))[0];
      if(match){goal.target={...match};goal.lastSeen=s.age;goal.seenStamp=observation.capturedAt;}
    }else if(s.hunger>.12&&s.age>=s.cueCooldownUntil){
      const eligible=candidates.filter(c=>!s.recentChecks.some(v=>distance(v,c)<35));
      eligible.sort((a,b)=>(b.score*12+Math.min(.12,b.salience*.012)-distance(s,b)*.00015)-
        (a.score*12+Math.min(.12,a.salience*.012)-distance(s,a)*.00015));
      const best=eligible[0];
      if(best){
        const same=s.pendingCue&&distance(best,s.pendingCue)<60&&similarity(best.descriptor,s.pendingCue.descriptor)>.55;
        const count=same?s.pendingCue.count+1:1;
        s.pendingCue={...best,count};
        if(count>=2){
          s.purpose={kind:'inspect',phase:'orient',target:{...best},started:s.age,expires:s.age+clamp(distance(s,best)/10+5,8,30),
            lastSeen:s.age,seenStamp:observation.capturedAt,bestDistance:distance(s,best),progressAt:s.age};
          s.pendingCue=null;s.cueCooldownUntil=s.age+1;
        }
      }else s.pendingCue=null;
    }
  }
  let goal=s.purpose;
  if(goal?.kind==='inspect'&&s.age-goal.lastSeen>1.8){endPurpose(s,'线索消失或无法重新确认',2);goal=null;}
  if(goal&&s.mode!=='feeding'){
    const d=distance(s,goal.target);
    if(d<goal.bestDistance-3){goal.bestDistance=d;goal.progressAt=s.age;}
    if(s.age>goal.expires||s.age-goal.progressAt>5){endPurpose(s,s.age>goal.expires?'持续检查仍未到达，暂时换一处':'持续无进展，换一处检查',2);goal=null;}
    else if(d<(goal.kind==='inspect'?Math.min(14,goal.target.radius*.35):20)){
      if(goal.kind==='explore'){endPurpose(s,'到达新的检查区域',2+random()*3);goal=null;}
      else {
        goal.arrivedAt??=s.age;
        if(s.age-goal.arrivedAt>1.4){endPurpose(s,'检查完成，未发生摄入',3);goal=null;}
        else goal.phase='verify';
      }
    }else if(goal.phase==='verify'){delete goal.arrivedAt;goal.phase='approach';}
  }
  // Exploration has a destination and decaying visit cost, not a time-sine turn.
  if(!goal&&s.age>=s.nextExploreAt&&s.mode!=='feeding'&&s.hunger>.05&&s.fatigue<.75){
    const options=[];
    for(let i=0;i<8;i++){
      const angle=s.heading+(i-3.5)*Math.PI/4+(random()-.5)*.25;
      const length=120+random()*65;
      const target={x:clamp(s.x+Math.cos(angle)*length,bounds.x+70,bounds.x+bounds.width-70),
        y:clamp(s.y+Math.sin(angle)*length,bounds.y+70,bounds.y+bounds.height-70),radius:20};
      const key=`${Math.floor(target.x/80)},${Math.floor(target.y/80)}`;
      const visit=s.visits.find(v=>v.key===key);
      options.push({target,cost:(visit?visit.count*(1-(s.age-visit.time)/90):0)+.2*Math.abs(angleDelta(angle,s.heading))+random()*.2});
    }
    const target=options.sort((a,b)=>a.cost-b.cost)[0].target;
    s.purpose=goal={kind:'explore',phase:'orient',target,started:s.age,expires:s.age+14,
      bestDistance:distance(s,target),progressAt:s.age};
  }
  if(!goal)return {active:false};
  const angle=angleDelta(Math.atan2(goal.target.y-s.y,goal.target.x-s.x),s.heading);
  const d=distance(s,goal.target);
  if(goal.phase!=='verify')goal.phase=Math.abs(angle)>.45?'orient':'approach';
  const uncertain=goal.kind==='inspect'&&(s.age-goal.lastSeen>.85||now-goal.seenStamp>1000);
  if(uncertain)goal.phase='reacquire';
  return {active:true,kind:goal.kind,phase:goal.phase,distance:d,
    turn:clamp(angle*2.4,-2.2,2.2),speedScale:goal.phase==='verify'||uncertain?0:Math.max(0,Math.cos(angle)),
    reason:goal.kind==='inspect'?`检查视觉区域 → ${{orient:'定向',approach:'持续接近',verify:'停下检查',reacquire:'重新确认'}[goal.phase]}（工程目标）`:
      `探索较少到访区域 → ${goal.phase==='orient'?'定向':'前进'}（短时访问记忆）`};
}

export function eligibleCue(s){
  const g=s.purpose;
  if(!s.visionEnabled||!s.visualSteeringEnabled||g?.kind!=='inspect'||s.age-g.lastSeen>1||
     Date.now()-g.seenStamp>1000||
     distance(s,g.target)>Math.min(55,g.target.radius+20))return null;
  return {token:g.target.token,seenAt:g.seenStamp};
}
