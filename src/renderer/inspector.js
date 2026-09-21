import { brainView } from './brain-view.js';
import { bodyView } from './body.js';
import { drawSpatial,drawPeripheral } from './spatial-vision.js';
const $ = id => document.getElementById(id);
const renderBody = bodyView($('portrait'), 2.5);
const { graph, view } = await window.flypet.bootstrap();
$('neurons').textContent = (view.brainInfo?.neurons ?? graph.neurons.length).toLocaleString();
$('connections').textContent = (view.brainInfo?.connections ?? graph.edges.length).toLocaleString();
const modes = { rest:'停留', walk:'行走', flight:'逃逸飞行', groom:'梳理', feeding:'进食' };
for (const name of ['locate','pause','save','quit','cursor','vision','caption','feed','sugar-remove','visual-steering','ignore-inspector']) $(name).onclick = () => window.flypet.command(name);
$('vision-layer').onchange=()=>{document.body.dataset.visualLayer=$('vision-layer').value;};
$('silence').onclick = () => window.flypet.command('silence-gf');
for (const button of document.querySelectorAll('[data-stim]')) button.onclick = () => window.flypet.command('stimulate', button.dataset.stim);
$('flyvis-source').onchange=()=>window.flypet.command('flyvis-source',$('flyvis-source').value);
const visionGroups=['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d'];
for(const g of visionGroups){const row=document.createElement('div');row.className='response-row';row.innerHTML=`<span>${g}</span><div class="response-track"><i id="bar-${g}"></i></div><b id="value-${g}">0.00</b>`;$('official-responses').append(row);}
let latest = view, lastPaint = 0, lastEvents = '';
$('monitor-toggle').onclick=()=>window.flypet.command(latest.monitor?.recording?'monitor-stop':'monitor-start');
window.flypet.subscribe(v => { latest = v; });
window.flypet.activity(active=>{document.body.dataset.renderActive=String(active);});
function focusPanel(name){
  const current=document.body.dataset.focus;
  if(!name||current===name)delete document.body.dataset.focus;
  else document.body.dataset.focus=name;
  for(const button of document.querySelectorAll('[data-expand]')){
    const active=document.body.dataset.focus===button.dataset.expand;
    button.textContent=active?'返回 · Esc':'放大';button.setAttribute('aria-expanded',String(active));
  }
}
for(const button of document.querySelectorAll('[data-expand]'))button.onclick=()=>focusPanel(button.dataset.expand);
document.addEventListener('keydown',e=>{if(e.key==='Escape')focusPanel(null);});
const network = await brainView(document.getElementById('network'), graph);
let lastVisionPaint='';
function official(v){
  const vision=v.officialVision??{status:'等待模型',retina:[],responses:{}};
  const paintKey=[vision.frames,vision.status,vision.source,v.state.visionEnabled,v.state.paused,
    v.state.ignoreInspector,v.state.visualSteeringEnabled,v.brainInfo?.backpressured,
    v.visualIntent?.reason,v.peripheralIntent?.reason,document.body.dataset.focus,
    document.body.dataset.visualLayer,$('motion-channel').value,
    $('official-retina').clientWidth,$('official-retina').clientHeight].join('|');
  if(paintKey===lastVisionPaint)return;
  lastVisionPaint=paintKey;
  if(vision.scenePreview&&$('capture-preview').getAttribute('src')!==vision.scenePreview)$('capture-preview').src=vision.scenePreview;
  $('ignore-inspector').textContent=`忽略观察室：${v.state.ignoreInspector?'开':'关'}`;
  const info=vision.inputInfo;
  $('input-status').textContent=!v.state.visionEnabled?'视觉采样关闭，显示最后画面':info?.nearUniform?
    (info.consoleMasked?'模型输入大部分为单色：观察室遮罩可能覆盖了视野，关闭“忽略观察室”或移开窗口。':'当前模型输入大部分为单色；请对照左侧采集画面。'):
    (info?.consoleMasked?'忽略观察室已开启：仅模型输入中的该区域留灰，左侧保留原画面对照。':'正在采集可见屏幕；观察室也会被看见，可将它移到另一块屏幕。');
  drawSpatial($('official-motion'),vision,$('motion-channel').value);
  drawPeripheral($('peripheral-view'),vision.peripheralView);
  const per=vision.peripheralView;
  $('peripheral-status').textContent=!v.state.visionEnabled?'周边采样已关闭':per?`周边粗看 · 当前屏幕内半径 480 DIP · 黄色表示亮度变化 · ${v.peripheralIntent?.reason??'建立基线'}`:'等待周边采样（测试图案不控制周边转向）';
  const ego=vision.egoMotion;
  $('ego-motion').textContent=!v.state.visionEnabled?'视觉关闭：保留上一帧':ego?`身体平移 ${ego.translationPerSecond.toFixed(0)} DIP/s · 转动 ${(ego.rotationPerSecond*180/Math.PI).toFixed(0)}°/s${ego.selfMotion?' · 画面含自运动影响':''}`:'等待身体运动反馈';
  const values=vision.valueView;
  $('local-values').textContent=!v.state.visionEnabled?'视觉关闭，转向偏置停用':values?`局部价值 左 ${values.scores[0].toFixed(3)} / 中 ${values.scores[1].toFixed(3)} / 右 ${values.scores[2].toFixed(3)} · ${v.visualIntent?.reason??'等待'}${v.state.paused?' · 已暂停':''}`:vision.valueError?'学习读出未加载：'+vision.valueError:'当前输入不提供行为价值';
  if(v.state.visionEnabled&&values?.regions)$('local-values').textContent=values.regions.length?`可见对比区域 ${values.regions.length} 处 · 最高个体价值 ${Math.max(...values.regions.map(c=>c.score)).toFixed(3)} · ${v.state.purpose?.kind==='inspect'?'正在持续检查':'等待稳定线索'}`:'当前无清晰局部线索，可按近期访问记录探索';
  $('visual-steering').textContent=`视觉辅助转向：${v.state.visualSteeringEnabled?'开':'关'}`;
  const canvas=$('official-retina'),ctx=canvas.getContext('2d'),width=canvas.clientWidth,height=canvas.clientHeight;
  const ratio=Math.min(2,devicePixelRatio);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const spacing=Math.max(1,Math.min((width-24)/32,(height-24)/32));
  let i=0;
  for(let u=-15;u<=15;u++)for(let w=Math.max(-15,-15-u);w<=Math.min(15,15-u);w++){
    const index=i++,lum=(vision.previewRetina??vision.retina)[index]??0,x=width/2+w*spacing,y=height/2+(u+w/2)*spacing;
    ctx.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;const xx=x+spacing*.49*Math.cos(a),yy=y+spacing*.49*Math.sin(a);k?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();
    const grey=Math.round(Math.max(0,Math.min(1,lum))*255);ctx.fillStyle=`rgb(${grey},${grey},${grey})`;ctx.fill();
    if(index===(vision.previewRetina?vision.previewCursorColumn:vision.cursorColumn)){ctx.strokeStyle='#f1b36f';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,spacing*1.6,0,Math.PI*2);ctx.stroke();}
  }
  for(const g of visionGroups){const val=vision.responses[g]??0;const bar=$('bar-'+g);bar.style.width=Math.min(50,Math.abs(val)*28)+'%';bar.style.left=(val<0?50-Math.min(50,Math.abs(val)*28):50)+'%';bar.style.background=g.startsWith('T4')?'#97c8af':'#d7ac7e';$('value-'+g).textContent=val.toFixed(2);}
  $('capture-status').textContent=v.state.visionEnabled?(vision.sourceLabel??vision.status):'视觉暂停';
  if(vision.source==='desktop'&&vision.cursorColumn!==null&&vision.cursorColumn!==undefined)$('capture-status').textContent+=' · 橙圈标注鼠标位置';
  $('change').textContent=vision.frames?`${vision.device} · ${vision.wallMs.toFixed(0)} ms · Δ活动`:'未训练 / 未微调';
  if(v.brainInfo?.backpressured&&!v.state.paused)$('capture-status').textContent='追赶计算：暂缓视觉采样，恢复后自动继续';
}
function paint(now) {
  if(document.body.dataset.renderActive==='false'){requestAnimationFrame(paint);return;}
  if(now-lastPaint>65){lastPaint=now;const v=latest,s=v.state,r=v.rates;
    renderBody(s);network(v);official(v);
    const observation=v.monitor;
    $('monitor-toggle').disabled=!observation||observation.writing;
    $('monitor-toggle').textContent=observation?.recording?'结束观察并出报告':'观察 30 分钟';
    $('monitor-status').textContent=observation?.recording?
      `记录中 ${Math.floor(observation.session.elapsedSeconds/60)}:${String(Math.floor(observation.session.elapsedSeconds%60)).padStart(2,'0')} / ${Math.round(observation.session.durationSeconds/60)} 分钟`:
      observation?.writing?'正在生成报告':observation?.error?'观察异常：'+observation.error:observation?.lastReport?'报告已保存 · output/behavior-monitor':`只记录，不干预 · ${observation?.url??'等待接口'}`;
    $('monitor-status').title=observation?.lastReport??observation?.url??'';
    $('thought').textContent=s.caption;$('mode').textContent=modes[s.mode];$('decision').textContent=s.decision;
    $('identity').textContent=`个体 ${s.id.slice(0,8)}`;$('age').textContent=`活动 ${Math.floor(s.age/60)}分${Math.floor(s.age%60)}秒`;
    const goal=s.purpose,learning=v.officialVision?.learning;
    $('purpose-title').textContent=goal?goal.kind==='inspect'?'目的：检查视觉区域':'目的：寻找新线索':'暂无持续目标';
    $('purpose-detail').textContent=goal?`${{orient:'正在定向',approach:'持续接近',verify:'停下检查',reacquire:'重新确认'}[goal.phase]??goal.phase} · 距区域中心 ${Math.hypot(s.x-goal.target.x,s.y-goal.target.y).toFixed(0)} DIP · 工程区域估计`:
      s.lastPurpose?`上次：${s.lastPurpose.reason}`:'等待线索或身体驱动';
    $('learning-status').textContent=learning?`个体摄入配对 ${learning.updates} 次 · 最近价值读出变化 ${learning.lastScoreChange?.toFixed(3)??'0.000'}`:'等待个体学习记忆';
    for(const k of ['hunger','fatigue','arousal']){$(k).value=s[k];$(k+'-label').textContent=Math.round(s[k]*100)+'%';}
    for(const [k,val] of [['visual',((r.lc4??0)+(r.lplc2??0))/2],['gf',r.gf],['walk',r.dnp09],['groom',r.dng11]]) $('rate-'+k).innerHTML=`${(val??0).toFixed(1)} <small>Hz</small>`;
    $('escapes').textContent=s.escapes;$('pause').textContent=s.paused?'继续模拟':'暂停模拟';$('live').textContent=s.paused?'○ 已暂停':'● 运行中';
    $('cursor').textContent=`鼠标感知：${s.cursorEnabled?'开':'关'}`;$('vision').textContent=`视觉采样：${s.visionEnabled?'开':'关'}`;
    $('feed').textContent=v.placingSugar?'选择桌面位置 · Esc 取消':'放置糖水';
    $('sugar-remove').disabled=!s.sugar;
    $('sugar-status').textContent=s.sugar?`糖水剩余 ${s.sugar.remaining.toFixed(1)} 秒 · ${s.paused?'已暂停':s.feedingActive?'正在摄入':v.contact?'已接触':'未接触'} · 已进食 ${s.feedings} 次`:'尚未放置糖水 · 接触后才能摄入';
    $('caption').textContent=`字幕：${s.showCaption?'开':'关'}`;$('silence').textContent=v.gfSilenced?'恢复 GF':'沉默 GF';
    $('sense').textContent=`独立鼠标几何刺激 ${Math.round(v.sense.strength*100)}%`;
    $('timing').textContent=v.brainInfo ? `全脑 ${v.brainInfo.computeMs.toFixed(0)} ms / 50 ms · 活跃 ${v.brainInfo.activeNeurons.toLocaleString()}` : `单步 ${(v.metrics?.tickMs??0).toFixed(1)} ms`;
    if(v.brainInfo)$('timing').textContent+=` · 待算 ${Math.round(v.brainInfo.lagMs??0)} ms · 自动追赶 ${v.brainInfo.catchups??0} 次`;
    if(!s.paused && v.brainInfo && v.brainInfo.status!=='全脑在线') $('live').textContent=v.brainInfo.status;
    $('save-path').textContent='个体与全脑存档 · '+s.id.slice(0,8)+' · 离线时间暂停';
    const key=JSON.stringify(v.events);if(key!==lastEvents){lastEvents=key;$('events').replaceChildren(...v.events.map(e=>{const div=document.createElement('div');div.className='event';const time=document.createElement('time');time.textContent=e.time.toFixed(1)+'s';const text=document.createElement('span');text.textContent=e.text;div.append(time,text);return div;}));}
  }
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);
