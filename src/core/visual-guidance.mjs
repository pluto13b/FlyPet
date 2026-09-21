// Engineering action readout of frozen visual values, not a whole-brain circuit.
export function visualGuidance(observation,state,previous={},now=Date.now()) {
  const off=reason=>({active:false,turn:0,reason,count:0,stamp:0});
  if(!state.visionEnabled||!state.visualSteeringEnabled)return off('视觉转向已关闭');
  const o=observation;
  if(!o?.available||o.source!=='desktop')return off('等待真实桌面价值');
  if(now-o.capturedAt>1000||now<o.capturedAt)return off('视觉价值已过期');
  if(!o.pose||Math.hypot(state.x-o.pose.x,state.y-o.pose.y)>40||Math.abs(Math.atan2(Math.sin(state.heading-o.pose.heading),Math.cos(state.heading-o.pose.heading)))>.35)return off('身体已离开原取景姿态');
  if(!Array.isArray(o.scores)||o.scores.length!==3||!o.scores.every(Number.isFinite))return off('价值读出无效');
  const order=[0,1,2].sort((a,b)=>o.scores[b]-o.scores[a]);
  const index=order[0],margin=o.scores[index]-o.scores[order[1]];
  if(o.scores[index]<.02||margin<.004)return off('没有明确的局部价值差异');
  const count=previous.index===index?(previous.count+(previous.stamp===o.capturedAt?0:1)):1;
  const active=count>=2&&state.hunger>.05&&state.fatigue<.9;
  return {active,index,margin,count,stamp:o.capturedAt,
    turn:active?[-.6,0,.6][index]*Math.min(1,Math.max(.25,state.hunger/.4)):0,
    reason:active?`视觉${['左侧','前方','右侧'][index]}价值较高（工程偏置）`:count<2?'等待第二次一致视觉证据':'身体暂不寻求奖励'};
}
