import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BehaviorMonitor,samplePet} from '../src/main/behavior-monitor.cjs';
import {analyze,trajectory} from '../src/main/behavior-report.cjs';
import {Pet} from '../src/core/pet.mjs';

const meta={petId:'test',startedAt:'test-start',endedAt:'test-end',durationSeconds:30,stopReason:'completed'};
const sample=(t,changes={})=>({type:'sample',t,id:'test',age:10+t,brainMs:10000+t*1000,
  x:200+t*10,y:150,heading:0,speed:10,bounds:{x:-300,y:0,width:1000,height:700},
  mode:'walk',reason:'DNp09 行走读出 + 工程探索偏置',motor:'neural-explore',
  escapes:0,feedings:0,flightUntil:0,sugar:null,contact:false,
  switches:{vision:true,steering:true,cursor:true},mouse:{strength:0,distance:500},
  visual:{active:false,reason:'没有明确的局部价值差异'},runtime:{status:'running',pendingMs:0},...changes});
const series=(seconds,change=()=>({}))=>Array.from({length:Math.round(seconds*10)+1},(_,i)=>sample(i/10,change(i/10)));

test('behavior report distinguishes absent food and visuals that did not control walking',()=>{
  const r=analyze(series(3,t=>({visual:{active:t>1,reason:'test'},motor:t>=2?'visual-value':'neural-explore'})),[],meta);
  assert.equal(r.sugar.placements,0);assert.equal(r.sugar.intakeSeconds,0);assert.equal(r.mouse.responseRate,null);
  assert.ok(r.findings.some(f=>f.includes('没有投喂效果证据')));
  assert.ok(Math.abs(r.visual.appliedSeconds-1)<1e-6);assert.ok(r.visual.intentSeconds>r.visual.appliedSeconds);
  assert.equal(r.movement.distanceDIP,30);assert.equal(r.behavior.completeBoutCount,0);
  assert.equal(r.behavior.censoredBouts,1);assert.equal(r.behavior.medianBoutSeconds.walk,null);
});

test('mouse opportunities debounce continuous threats and exclude manual and clipped windows',()=>{
  const a=series(8,t=>({mouse:{strength:(t>=1&&t<2)||(t>=4&&t<5)||t>=7.8?.4:0,distance:40},
    escapes:t>=4.3?2:t>=1.2?1:0,
    reason:t>=4.3?'实验手动刺激 + GF 放电 1 次 → 逃逸':t>=1.2?'近期鼠标威胁 + GF 放电 1 次 → 逃逸':'walk'}));
  const r=analyze(a,[{type:'command',action:'stimulate',value:'gf',age:14.1,t:4.1}],meta);
  assert.equal(r.mouse.encounters,3);assert.equal(r.mouse.eligible,1);assert.equal(r.mouse.responded,1);
  assert.equal(r.mouse.confounded,1);assert.equal(r.mouse.censored,1);
  assert.ok(Math.abs(r.mouse.medianLatencySeconds-.2)<1e-6);
  assert.equal(r.mouse.naturalEscapes,1);assert.equal(r.mouse.manualEscapes,1);
});

test('paused/catchup wall time, complete bouts, intake, and jumps retain separate meanings',()=>{
  const a=series(5,t=>({age:10+Math.min(t,3),brainMs:10000+Math.min(t,3)*1000,
    x:t>=2?900:200+t*10,mode:t<1?'rest':t<2?'walk':'groom',
    runtime:{status:t<3?'running':t<4?'paused':'catchup',pendingMs:t>=4?300:0},
    sugar:{x:500,y:400,remaining:6},contact:t>=2&&t<3}));
  const events=[{type:'command',action:'locate',age:12,t:2},{type:'intake',age:12.5,t:2.5,seconds:.02}];
  const r=analyze(a,events,meta);
  assert.ok(Math.abs(r.availability.paused-1)<1e-6);assert.ok(Math.abs(r.availability.catchup-1)<1e-6);
  assert.equal(r.simulationSeconds,3);assert.equal(r.behavior.completeBoutCount,1);
  assert.equal(r.behavior.medianBoutSeconds.walk,1);assert.equal(r.movement.excludedJumps,1);
  assert.equal(r.sugar.intakeSeconds,.02);assert.equal(r.sugar.contactSeconds,1);
  assert.ok(trajectory(a).includes('Electron DIP'));assert.ok(!trajectory(a).includes('NaN'));
});

test('local endpoint records, auto-finishes and refuses cross-origin control without mutating pet',async()=>{
  const root=fs.mkdtempSync(path.resolve('.cache/tmp/behavior-test-'));
  const graph=JSON.parse(fs.readFileSync('data/circuit.json','utf8')),pet=new Pet(graph,{id:'observation-test'});
  const snapshot=()=>{const saved=pet.snapshot();delete saved.savedAt;return saved;};
  const before=snapshot();
  const monitor=new BehaviorMonitor({root,getSample:()=>samplePet(pet,{view:{scenePreview:'PRIVATE IMAGE',retina:[1,2,3]}}),getEvents:()=>pet.events});
  try{
    const url=await monitor.listen(0);
    assert.ok(url.startsWith('http://127.0.0.1:'));
    const status=await (await fetch(url+'/status')).json();
    assert.equal(status.current.id,pet.state.id);assert.ok(!JSON.stringify(status).includes('PRIVATE'));
    const start=body=>fetch(url+'/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await start({durationSeconds:0})).status,400);
    assert.equal((await fetch(url+'/sessions',{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(url+'/sessions',{method:'POST',body:'{}'})).status,415);
    assert.equal((await start({durationSeconds:1})).status,201);
    assert.equal((await start({durationSeconds:1})).status,409);
    assert.equal((await fetch(url+'/stimulate',{method:'POST',body:'{}'})).status,404);
    await new Promise(r=>setTimeout(r,1250));
    await monitor.finishing;
    assert.equal(monitor.status().recording,false);assert.equal(monitor.last.stopReason,'completed');
    assert.ok(monitor.last.samples>=8);
    for(const file of ['samples.jsonl','summary.json','report.md','trajectory.svg','session.json'])assert.ok(fs.existsSync(path.join(monitor.last.directory,file)));
    assert.equal((await fetch(url+'/report')).status,200);
    assert.deepEqual(snapshot(),before);
    const lines=fs.readFileSync(path.join(monitor.last.directory,'samples.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(lines.every(s=>s.type==='sample'));assert.equal(lines.at(-1).id,pet.state.id);
  }finally{await monitor.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('intake events are per-step, deduplicated, and old intake is not counted at session start',async()=>{
  const root=fs.mkdtempSync(path.resolve('.cache/tmp/behavior-test-'));
  let intake={time:1,seconds:.02,x:0,y:0};
  const monitor=new BehaviorMonitor({root,getSample:()=>sample(0),getIntake:()=>intake});
  try{
    monitor.start(30);monitor.intake();
    intake={...intake,time:2};monitor.intake();monitor.intake();
    intake={...intake,time:2.02};monitor.intake();
    await monitor.close();
    const report=JSON.parse(fs.readFileSync(path.join(monitor.last.directory,'summary.json'),'utf8'));
    assert.equal(report.sugar.intakeSeconds,.04);assert.equal(report.session.stopReason,'app-exit');
  }finally{await monitor.close();fs.rmSync(root,{recursive:true,force:true});}
});
