const COLORS={rest:'#8195a1',walk:'#74c7a6',flight:'#ef9c69',groom:'#ac97d6',feeding:'#ecd37e'};
const NAMES={rest:'停留',walk:'行走',flight:'逃逸飞行',groom:'梳理',feeding:'进食'};
const median=a=>a.length?[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const ratio=(a,b)=>b>0?a/b:null;
const add=(o,k,v)=>{o[k]=(o[k]??0)+v;};
const percent=x=>x===null?'无有效机会':`${(100*x).toFixed(1)}%`;

// All durations below come from observed samples, never from frame counts.
function analyze(samples,events,meta){
  const first=samples[0],last=samples.at(-1);
  const r={session:meta,samples:samples.length,wallSeconds:last?.t??0,
    simulationSeconds:first?Math.max(0,last.age-first.age):0,
    brainSeconds:first?Math.max(0,(last.brainMs-first.brainMs)/1000):0,
    availability:{running:0,paused:0,catchup:0,saving:0,failed:0,unobserved:0,maxSampleGap:0,maxBacklogMs:0},
    behavior:{seconds:{},completeBouts:[],censoredBouts:0,shortOrdinaryBouts:0},
    movement:{distanceDIP:0,excludedJumps:0,visitedCells:0,reentries:0,maxCellShare:null},
    mouse:{encounters:0,eligible:0,responded:0,missed:0,censored:0,confounded:0,ineligible:0,latenciesSeconds:[],naturalEscapes:0,manualEscapes:0,otherEscapes:0},
    sugar:{placements:0,presentSeconds:0,contactSeconds:0,intakeSeconds:0,feedingStarts:0},
    visual:{enabledSeconds:0,walkSeconds:0,intentSeconds:0,appliedSeconds:0,peripheralAppliedSeconds:0,reasons:{},configurations:{}},
    commands:{},findings:[]};
  if(!first)return r;
  const cells={};let cellBefore=null,bout={mode:first.mode,start:first.age,censored:true},encounter=null,clearSince=null;
  const manualTimes=events.filter(e=>e.type==='command'&&e.action==='stimulate'&&e.value==='gf').map(e=>e.age);
  const encounters=[];
  const relocations=events.filter(e=>e.type==='command'&&e.action==='locate');
  for(const e of events){
    if(e.type==='command')add(r.commands,e.action,1);
    if(e.type==='intake')r.sugar.intakeSeconds+=e.seconds;
    if(e.type==='pet-event'&&e.text.startsWith('世界：放下一滴糖水'))r.sugar.placements++;
  }
  for(let i=0;i<samples.length;i++){
    const s=samples[i],p=samples[i-1];
    r.availability.maxBacklogMs=Math.max(r.availability.maxBacklogMs,s.runtime.pendingMs);
    if(p){
      const wall=Math.max(0,s.t-p.t),sim=Math.max(0,s.age-p.age);
      const gap=wall>.5;
      r.availability.maxSampleGap=Math.max(r.availability.maxSampleGap,wall);
      add(r.availability,gap?'unobserved':p.runtime.status,wall);
      if(!gap){
        add(r.behavior.seconds,p.mode,sim);
        const key=`${Math.floor(p.x/80)},${Math.floor(p.y/80)}`;
        if(sim>0){if(key!==cellBefore&&cells[key])r.movement.reentries++;add(cells,key,sim);cellBefore=key;}
        const distance=Math.hypot(s.x-p.x,s.y-p.y);
        const relocated=relocations.some(e=>e.t>p.t&&e.t<=s.t);
        if(distance>230*sim+30||relocated)r.movement.excludedJumps++;else r.movement.distanceDIP+=distance;
        if(p.sugar){r.sugar.presentSeconds+=sim;if(p.contact)r.sugar.contactSeconds+=sim;}
        const v=r.visual;
        const config=`vision=${+p.switches.vision},steering=${+p.switches.steering},mouse=${+p.switches.cursor}`;
        add(v.configurations,config,sim);
        if(p.switches.vision&&p.switches.steering){
          v.enabledSeconds+=sim;add(v.reasons,p.visual.reason??'未知',sim);
          if(p.visual.active)v.intentSeconds+=sim;
          if(p.mode==='walk')v.walkSeconds+=sim;
        }
        if(p.motor==='visual-value')v.appliedSeconds+=sim;
        if(p.motor==='peripheral')v.peripheralAppliedSeconds+=sim;
      }
      if(s.mode!==p.mode||gap){
        if(bout.censored||gap)r.behavior.censoredBouts++;
        else r.behavior.completeBouts.push({mode:bout.mode,seconds:s.age-bout.start});
        bout={mode:s.mode,start:s.age,censored:gap};
      }
      const escapes=Math.max(0,s.escapes-p.escapes);
      if(escapes){
        const kind=s.reason.startsWith('实验手动刺激')?'manual':s.reason.startsWith('近期鼠标威胁')?'natural':'other';
        r.mouse[`${kind}Escapes`]+=escapes;
        if(encounter&&s.age-encounter.age<=1&&kind==='natural'&&encounter.latency===null)encounter.latency=s.age-encounter.age;
        if(encounter&&kind==='manual'&&s.age-encounter.age<=1)encounter.confounded=true;
      }
      r.sugar.feedingStarts+=Math.max(0,s.feedings-p.feedings);
    }
    // Debounce one continuous threat; don't count each frame as a new opportunity.
    const threat=s.runtime.status==='running'&&s.switches.cursor&&s.mouse.strength>=.25;
    if(!threat){
      if(clearSince===null)clearSince=s.age;
      if(encounter&&s.age-clearSince>=1)encounter=null;
    }else{
      if(!encounter){
        encounter={age:s.age,eligible:s.mode!=='flight'&&s.age>s.flightUntil+.6,latency:null,confounded:false,leftCensored:i===0};
        encounters.push(encounter);
        // The response and onset may land in the same 100 ms sample.
        if(p&&s.escapes>p.escapes&&s.reason.startsWith('近期鼠标威胁')){
          encounter.eligible=p.mode!=='flight'&&p.age>p.flightUntil+.6;
          encounter.latency=0;
        }
      }
      clearSince=null;
    }
  }
  r.behavior.censoredBouts++;
  const ordinary=r.behavior.completeBouts.filter(b=>['walk','rest','groom'].includes(b.mode));
  r.behavior.shortOrdinaryBouts=ordinary.filter(b=>b.seconds<.5).length;
  r.behavior.shortOrdinaryRatio=ratio(r.behavior.shortOrdinaryBouts,ordinary.length);
  r.behavior.medianBoutSeconds=Object.fromEntries(Object.keys(NAMES).map(mode=>[mode,median(r.behavior.completeBouts.filter(b=>b.mode===mode).map(b=>b.seconds))]));
  // Keep the report compact; the raw trace can reconstruct every bout.
  r.behavior.completeBoutCount=r.behavior.completeBouts.length;delete r.behavior.completeBouts;
  r.movement.visitedCells=Object.keys(cells).length;
  r.movement.maxCellShare=ratio(Math.max(0,...Object.values(cells)),Object.values(cells).reduce((a,b)=>a+b,0));
  for(const e of encounters){
    r.mouse.encounters++;
    if(e.leftCensored){r.mouse.censored++;continue;}
    if(!e.eligible){r.mouse.ineligible++;continue;}
    if(e.confounded||manualTimes.some(t=>t>=e.age-.5&&t<=e.age+1)){r.mouse.confounded++;continue;}
    if(e.latency===null&&last.age-e.age<1){r.mouse.censored++;continue;}
    r.mouse.eligible++;
    if(e.latency===null)r.mouse.missed++;
    else{r.mouse.responded++;r.mouse.latenciesSeconds.push(e.latency);}
  }
  r.mouse.responseRate=ratio(r.mouse.responded,r.mouse.eligible);
  r.mouse.medianLatencySeconds=median(r.mouse.latenciesSeconds);delete r.mouse.latenciesSeconds;
  r.visual.walkAppliedShare=ratio(r.visual.appliedSeconds+r.visual.peripheralAppliedSeconds,r.visual.walkSeconds);
  const f=r.findings;
  if(r.mouse.eligible===0)f.push('没有完整、可判读的鼠标威胁机会；本轮不能判断鼠标互动是否有效。');
  else f.push(`${r.mouse.eligible} 次有效鼠标威胁机会中，${r.mouse.responded} 次在 1 模拟秒内伴随逃逸（${percent(r.mouse.responseRate)}）；这是自然观察的时序关联。`);
  if(r.sugar.presentSeconds===0)f.push('本轮未观察到糖水在场；没有投喂效果证据。');
  else if(r.sugar.contactSeconds===0&&r.sugar.intakeSeconds===0)f.push('糖水存在但没有地面接触或摄入；应检查接近/寻食能力，不能据此判定进食机制失效。');
  else f.push(`地面接触约 ${r.sugar.contactSeconds.toFixed(1)} 模拟秒，实际摄入 ${r.sugar.intakeSeconds.toFixed(2)} 秒储量，开始进食 ${r.sugar.feedingStarts} 次。`);
  if(r.visual.walkSeconds>0)f.push(`启用视觉辅助时，行走 ${r.visual.walkSeconds.toFixed(1)} 模拟秒，其中 ${percent(r.visual.walkAppliedShare)} 实际采用前方价值或周边查看；意图活跃不等于执行。`);
  else f.push('缺少启用视觉辅助时的行走片段，无法判断视觉对行走的参与程度。');
  if(r.availability.catchup>0)f.push(`计算追赶占墙钟 ${r.availability.catchup.toFixed(1)} 秒，与休息/梳理分开计量。`);
  if(r.availability.unobserved>0)f.push(`采样缺口共 ${r.availability.unobserved.toFixed(1)} 秒；缺口不归因于任何具体动作。`);
  const learned=samples.filter(s=>Number.isFinite(s.learning?.updates));
  r.learning={available:learned.length>0,updates:learned.length?Math.max(0,learned.at(-1).learning.updates-learned[0].learning.updates):0};
  if(r.learning.available)f.push(`观察期间记录到 ${r.learning.updates} 次摄入配对价值更新；是否形成选择性偏好仍需比较相近条件下的行为。`);
  f.push('记录器只观察、不发奖励；轨迹复访本身不证明学习，不从这些指标给出未经校准的宠物感总分。');
  return r;
}

function markdown(r){
  const n=x=>x===null?'无完整片段':x.toFixed(2);
  return `# FlyPet 行为观察报告\n\n个体：${r.session.petId}  \n开始：${r.session.startedAt}  \n结束：${r.session.endedAt}（${r.session.stopReason}）  \n计划：${r.session.durationSeconds} 秒；实际墙钟 ${n(r.wallSeconds)} 秒，身体 ${n(r.simulationSeconds)} 秒，脑模拟 ${n(r.brainSeconds)} 秒。\n\n## 观察结论\n\n${r.findings.map(t=>'- '+t).join('\n')}\n\n## 行为与空间\n\n| 动作 | 模拟秒 | 完整动作段中位数/秒 |\n|---|---:|---:|\n${Object.entries(NAMES).map(([k,v])=>`| ${v} | ${n(r.behavior.seconds[k]??0)} | ${n(r.behavior.medianBoutSeconds?.[k]??null)} |`).join('\n')}\n\n完整动作段 ${r.behavior.completeBoutCount??0}；首尾/缺口截断 ${r.behavior.censoredBouts}。普通动作短于 0.5 秒比例 ${percent(r.behavior.shortOrdinaryRatio??null)}，含紧急打断，不直接等同错误。\n\n移动 ${n(r.movement.distanceDIP)} DIP；排除跳变 ${r.movement.excludedJumps} 次；到访 ${r.movement.visitedCells} 个 80 DIP 网格，重新进入已到访网格 ${r.movement.reentries} 次；单格最大停留占比 ${percent(r.movement.maxCellShare)}。见 [轨迹图](trajectory.svg)。\n\n## 互动与运行\n\n鼠标遭遇 ${r.mouse.encounters}；有效 ${r.mouse.eligible}；未响应 ${r.mouse.missed}；干预混杂 ${r.mouse.confounded}；首尾截断 ${r.mouse.censored}；状态不适合响应 ${r.mouse.ineligible}。响应延迟中位数 ${n(r.mouse.medianLatencySeconds)} 秒（100 ms 采样量级，0 表示同一采样区间）。自然逃逸 ${r.mouse.naturalEscapes}，手动逃逸 ${r.mouse.manualEscapes}，其他 ${r.mouse.otherEscapes}。\n\n糖水放置 ${r.sugar.placements} 次；糖水在场 ${n(r.sugar.presentSeconds)} 模拟秒；摄入量只累计实际模拟步摄入事件。\n\n视觉意图活跃 ${n(r.visual.intentSeconds)} 秒；前方价值实际采用 ${n(r.visual.appliedSeconds)} 秒；周边查看实际采用 ${n(r.visual.peripheralAppliedSeconds)} 秒。不同开关时段只分组描述，不视作随机对照。\n\n| 运行状态 | 墙钟秒 |\n|---|---:|\n${Object.entries({running:'正常运行',paused:'手动暂停',catchup:'计算追赶',saving:'保存',failed:'故障',unobserved:'采样缺口'}).map(([k,v])=>`| ${v} | ${n(r.availability[k])} |`).join('\n')}\n\n最大脑待算 ${n(r.availability.maxBacklogMs)} ms；最大采样间隔 ${n(r.availability.maxSampleGap)} 秒；样本 ${r.samples}。\n\n## 数据与边界\n\n原始数据 [samples.jsonl](samples.jsonl)；完整指标 [summary.json](summary.json)。未保存屏幕图像或键盘内容。模拟时长与墙钟分开；10 Hz 轨迹可能漏掉极短动作。记录器不主动操纵正式个体；个体学习更新按实际事件列出，不等同于食物语义识别。\n`;
}

function trajectory(samples){
  if(!samples.length)return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const minX=Math.min(...samples.map(s=>s.bounds.x)),minY=Math.min(...samples.map(s=>s.bounds.y));
  const width=Math.max(...samples.map(s=>s.bounds.x+s.bounds.width))-minX;
  const height=Math.max(...samples.map(s=>s.bounds.y+s.bounds.height))-minY;
  const scale=1000/Math.max(width,height),xy=s=>`${((s.x-minX)*scale).toFixed(1)},${((s.y-minY)*scale+45).toFixed(1)}`;
  const paths=[];let current=null;
  for(let i=1;i<samples.length;i++){
    const p=samples[i-1],s=samples[i];
    if(s.t-p.t>.5||Math.hypot(s.x-p.x,s.y-p.y)>230*Math.max(0,s.age-p.age)+30){current=null;continue;}
    if(!current||current.mode!==s.mode){current={mode:s.mode,points:[xy(p)]};paths.push(current);}
    current.points.push(xy(s));
  }
  const displays=[...new Map(samples.map(s=>[JSON.stringify(s.bounds),s.bounds])).values()];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${Math.ceil(height*scale+110)}" viewBox="-20 0 1100 ${height*scale+110}"><rect x="-20" width="1100" height="100%" fill="#101817"/><g font-family="Segoe UI, sans-serif" font-size="15">${Object.keys(NAMES).map((k,i)=>`<text x="${i*145}" y="25" fill="${COLORS[k]}">${NAMES[k]}</text>`).join('')}${displays.map(b=>`<rect x="${(b.x-minX)*scale}" y="${(b.y-minY)*scale+45}" width="${b.width*scale}" height="${b.height*scale}" fill="none" stroke="#465953"/>`).join('')}${paths.map(p=>`<polyline points="${p.points.join(' ')}" fill="none" stroke="${COLORS[p.mode]??'#fff'}" stroke-opacity=".55" stroke-width="1.2"/>`).join('')}<circle cx="${xy(samples[0]).split(',')[0]}" cy="${xy(samples[0]).split(',')[1]}" r="6" fill="#fff"/><text x="0" y="${height*scale+80}" fill="#c0d1c8">白点：起点 · 红圈：终点 · Electron DIP · 仅绘制连续采样轨迹</text><circle cx="${xy(samples.at(-1)).split(',')[0]}" cy="${xy(samples.at(-1)).split(',')[1]}" r="8" fill="none" stroke="#f88" stroke-width="2"/></g></svg>`;
}
module.exports={analyze,markdown,trajectory};
