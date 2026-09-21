import test from 'node:test';
import assert from 'node:assert/strict';
import {peripheralGuidance} from '../src/core/peripheral-guidance.mjs';
import {Pet} from '../src/core/pet.mjs';
import fs from 'node:fs';
const state={x:500,y:500,heading:0,age:10,visionEnabled:true,visualSteeringEnabled:true,fatigue:0,mode:'walk'};
const observation={available:true,source:'desktop',baselineReady:true,capturedAt:1000,pose:{x:500,y:500},sectors:Array.from({length:8},(_,i)=>({sector:i,samples:100,change:i===4?.4:0,bearing:i*Math.PI/4}))};
test('rear changes orient briefly; front handoff, expiry and disabled input stop the turn',()=>{
  const p=peripheralGuidance(observation,state,{},1100);assert.equal(p.active,true);assert.ok(p.turn>0);
  assert.equal(peripheralGuidance({...observation,capturedAt:1100},{...state,heading:Math.PI},p,1200).active,false);
  assert.equal(peripheralGuidance(observation,state,p,2000).active,false);
  assert.equal(peripheralGuidance(observation,{...state,visionEnabled:false},p,1100).active,false);
  assert.equal(peripheralGuidance(observation,{...state,mode:'feeding'},p,1100).active,false);
  assert.equal(peripheralGuidance({...observation,capturedAt:3100},{...state,age:12.1},p,3200).active,false);
});
test('uniform global changes do not select an arbitrary direction',()=>{
  const o={...observation,sectors:observation.sectors.map(s=>({...s,change:.4}))};
  assert.equal(peripheralGuidance(o,state,{},1100).active,false);
});
test('peripheral evidence changes actual body heading and can wake a resting pet',()=>{
  const graph=JSON.parse(fs.readFileSync(new URL('../data/circuit.json',import.meta.url)));
  const p=new Pet(graph,{id:'peripheral-body-test'});
  p.brain.step=()=>({gfSpikes:0,rates:{dnp09:0}});
  Object.assign(p.state,state,{mode:'rest',behaviorUntil:0});
  p.peripheralObservation={...observation,capturedAt:Date.now()};
  p.step(.1);
  assert.equal(p.state.mode,'walk');assert.ok(p.state.heading>0);
  assert.match(p.state.decision,/周边变化/);
  p.state.visionEnabled=false;p.step(.1);assert.equal(p.peripheralIntent.active,false);
});
