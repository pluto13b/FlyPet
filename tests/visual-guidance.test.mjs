import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {visualGuidance} from '../src/core/visual-guidance.mjs';
import {Pet} from '../src/core/pet.mjs';
const pose={x:200,y:200,heading:0};
const state={...pose,visionEnabled:true,visualSteeringEnabled:true,hunger:.8,fatigue:0};
const observation={available:true,source:'desktop',pose,scores:[.08,.03,.01],capturedAt:1000};
test('visual turn needs two distinct fresh observations, respects direction and resets on invalid input',()=>{
  const first=visualGuidance(observation,state,{},1100);assert.equal(first.active,false);
  assert.equal(visualGuidance(observation,state,first,1100).active,false);
  const next={...observation,capturedAt:1050};const second=visualGuidance(next,state,first,1100);
  assert.equal(second.active,true);assert.ok(second.turn<0);
  for(const changed of [{...next,source:'right'},{...next,capturedAt:1},{...next,scores:[.03,.03,.03]}])assert.equal(visualGuidance(changed,state,second,1100).active,false);
  for(const changed of [{...state,visionEnabled:false},{...state,visualSteeringEnabled:false},{...state,heading:1},{...state,x:260}])assert.equal(visualGuidance(next,changed,second,1100).active,false);
});
test('image value changes actual walking heading; visual toggle removes the bias',()=>{
  const graph=JSON.parse(fs.readFileSync(new URL('../data/circuit.json',import.meta.url)));
  function run(scores,enabled){
    const p=new Pet(graph,{id:'visual-test'});
    p.brain.step=()=>({gfSpikes:0,rates:{dnp09:10,'dna02:left':0,'dna02:right':0}});
    p.state.x=200;p.state.y=200;p.state.heading=0;p.state.hunger=.8;p.state.visualSteeringEnabled=enabled;
    const now=Date.now();
    for(let i=0;i<2;i++){p.visualObservation={...observation,pose:{...pose},scores,capturedAt:now-100+i*50};p.step(.1);}
    return p.state.heading;
  }
  assert.ok(run([.08,.03,.01],true)<0);assert.ok(run([.01,.03,.08],true)>0);
  assert.equal(run([.08,.03,.01],false),0);
});
