import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {WholeBrainBridge} from '../../src/main/whole-brain.cjs';
import {Pet} from '../../src/core/pet.mjs';
const root=path.resolve('.'),folder=fs.mkdtempSync(path.join(root,'.cache/tmp/purpose-brain-'));
const out=path.join(root,'output/purpose-learning');fs.mkdirSync(out,{recursive:true});
const graph=JSON.parse(fs.readFileSync('data/circuit.json','utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function vision(){
  const child=spawn(path.join(root,'.venv-vision/Scripts/python.exe'),['-u','src/vision/closed_loop_fixture.py'],{cwd:root,windowsHide:true,env:process.env});
  let id=0,ready,stderr='';const pending=new Map();const initialized=new Promise(r=>ready=r);
  child.stderr.on('data',d=>stderr=(stderr+d).slice(-4000));
  createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.ready)ready();else{const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result);}}}catch{}});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('fixture exited '+stderr));}pending.clear();});
  return {ready:initialized,request(command,data={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(new Error('fixture timeout '+stderr));},30000);pending.set(key,{resolve,reject,timer});child.stdin.write(JSON.stringify({id:key,command,...data})+'\n');});},
    close(){return new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin.end('{"command":"quit"}\n');});}};
}
const brain=new WholeBrainBridge(root,folder,graph,console.error);let eye=vision();
const trace=[],started=performance.now();let reward=null,report;
try{
  await Promise.all([brain.ready,eye.ready]);
  const p=new Pet(graph,{brain,id:'independent-purpose-test',bounds:{x:0,y:0,width:800,height:600}});
  Object.assign(p.state,{x:300,y:300,heading:0,hunger:1,cursorEnabled:false,nextExploreAt:1000});
  p.placeSugar({x:405,y:300});
  await eye.request('restore',{petId:p.state.id});
  let frames=0;
  for(let i=0;i<500&&!reward;i++){
    if(i%5===0){
      const s=p.state,view={x:s.x,y:s.y,heading:s.heading,span:320,forward:80,display:{x:0,y:0,width:800,height:600},pose:{x:s.x,y:s.y,heading:s.heading}};
      const r=await eye.request('observe',{source:'desktop',view,elapsedMs:250,sentAt:Date.now(),preview:false});
      p.visualObservation=r.valueView;p.peripheralObservation=r.peripheralView;frames=r.frames;
    }
    p.step(.05);
    trace.push({age:p.state.age,x:p.state.x,y:p.state.y,mode:p.state.mode,goal:p.state.purpose?.kind,phase:p.state.purpose?.phase,hunger:p.state.hunger,rate:brain.groupRates().dnp09});
    if(p.state.lastIntake?.cue&&p.state.lastIntake.meal){reward=await eye.request('reward',{petId:p.state.id,key:`${p.state.id}:${p.state.feedings}`,token:p.state.lastIntake.cue.token});}
    await wait(50);
  }
  assert.ok(p.state.feedings>0,'Autonomous image-based approach must reach contact');
  assert.equal(reward?.updated,true,'Actual intake must update the matched cue');
  brain.suspended=true;if(brain.inflight)await brain.inflight;
  const saved=p.snapshot();saved.visualLearning=await eye.request('checkpoint');await brain.checkpoint(saved);
  await eye.close();eye=vision();await eye.ready;
  await eye.request('restore',{petId:p.state.id,snapshot:saved.visualLearning});
  const recovered=await eye.request('checkpoint');assert.deepEqual(recovered,saved.visualLearning);
  const reloaded=new WholeBrainBridge(root,folder,graph,console.error);
  try{const data=await reloaded.ready;assert.equal(data.restoredPet.state.id,p.state.id);assert.deepEqual(data.restoredPet.visualLearning,recovered);assert.equal(data.view.timeMs,saved.brain.timeMs);}finally{await reloaded.close();}
  report={passed:true,petId:p.state.id,wallSeconds:(performance.now()-started)/1000,simulationSeconds:p.state.age,
    frames,feedings:p.state.feedings,hunger:p.state.hunger,reward,finalPosition:[p.state.x,p.state.y],
    neurons:brain.n,pairedCheckpointRestored:true,boundary:'Independent full-brain pet; synthetic screen pixels. World food coordinates used only for drawing/contact, not visual candidate or navigation input.'};
}catch(e){report={passed:false,error:e.stack,wallSeconds:(performance.now()-started)/1000};process.exitCode=1;}
finally{
  await eye.close();await brain.close();
  fs.writeFileSync(path.join(out,'closed-loop.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,'closed-loop-trajectory.json'),JSON.stringify(trace));
  fs.rmSync(folder,{recursive:true,force:true});console.log(JSON.stringify(report));
}
