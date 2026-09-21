// Brief orienting response to coarse screen changes, not neural looming or navigation.
export function peripheralGuidance(o,s,previous={},now=Date.now()) {
  const off=reason=>({active:false,turn:0,reason,cooldownUntil:previous.cooldownUntil??0});
  if(!s.visionEnabled||!s.visualSteeringEnabled)return off('周边转向已关闭');
  if(s.fatigue>=.9||s.mode==='flight'||s.mode==='feeding'||(s.mode==='groom'&&s.age<s.behaviorUntil))return off('当前动作优先');
  if(!o?.available||o.source!=='desktop'||!o.baselineReady||now-o.capturedAt>800||now<o.capturedAt)return off('等待新鲜周边变化');
  if(!o.pose||Math.hypot(s.x-o.pose.x,s.y-o.pose.y)>80)return off('已离开周边取景位置');
  const delta=b=>Math.atan2(Math.sin(b-s.heading),Math.cos(b-s.heading));
  if(previous.active&&s.age<previous.until){
    const angle=delta(previous.bearing);
    if(Math.abs(angle)<.35)return off('已转入前方视野');
    return {...previous,turn:Math.max(-1.6,Math.min(1.6,angle*2))};
  }
  if(s.age<(previous.cooldownUntil??0))return off('周边查看冷却中');
  const candidates=(o.sectors??[]).filter(v=>v.samples>=4&&Number.isFinite(v.change)&&Number.isFinite(v.bearing)).sort((a,b)=>b.change-a.change);
  const best=candidates[0];
  if(!best||best.change<.1||best.change-(candidates[1]?.change??0)<.03)return off('无突出的周边变化');
  const angle=delta(best.bearing);
  if(Math.abs(angle)<.5)return off('变化已在前方');
  return {active:true,bearing:best.bearing,sector:best.sector,until:s.age+2,cooldownUntil:s.age+5,
    turn:Math.max(-1.6,Math.min(1.6,angle*2)),reason:'周边变化 → 转身查看（工程感知）'};
}
