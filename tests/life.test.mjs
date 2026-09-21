import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Pet} from '../src/core/pet.mjs';
const graph=JSON.parse(fs.readFileSync(new URL('../data/circuit.json',import.meta.url)));
function fixture(){
  const brain={isWholeBrain:true,n:138639,rates:[],groups:{gf:[]},silenced:new Set(),timeMs:0,
    values:{dnp09:0,dng11:0},gf:0,groupRates(){return this.values;},
    step(ms,inputs){this.timeMs+=ms;this.inputs=inputs;return {gfSpikes:this.gf,rates:this.values};},
    snapshot(){return{};},restore(){},stimulate(){this.gf=1;}};
  return new Pet(graph,{brain,id:'life-test'});
}
test('background GF cannot cause escape, recent threat and explicit intervention can',()=>{
  const p=fixture();p.brain.gf=1;
  for(let i=0;i<50;i++)p.step(.1);
  assert.equal(p.state.escapes,0);
  p.step(.02,{x:p.state.x,y:p.state.y});assert.equal(p.state.escapes,1);
  const q=fixture();q.stimulate('gf');for(let i=0;i<40;i++)q.step(.1);
  assert.equal(q.state.escapes,1); // One intervention must not permit repeated background escapes.
});
test('ordinary modes keep their duration and hysteresis; fatigue and contact interrupt',()=>{
  const p=fixture();p.brain.values.dnp09=3;p.step(.02);assert.equal(p.state.mode,'walk');
  p.brain.values.dnp09=0;for(let i=0;i<10;i++)p.step(.1);
  assert.equal(p.state.mode,'walk');p.step(.1);p.step(.1);assert.equal(p.state.mode,'rest');
  p.brain.values.dng11=9;for(let i=0;i<10;i++)p.step(.1);assert.equal(p.state.mode,'groom');
  p.brain.values.dng11=6;for(let i=0;i<20;i++)p.step(.1);assert.equal(p.state.mode,'groom');
  p.placeSugar({x:p.state.x,y:p.state.y});p.state.hunger=.8;p.step(.02);assert.equal(p.state.mode,'feeding');
  p.removeSugar();p.state.fatigue=.95;p.step(.02);assert.equal(p.state.mode,'rest');
});
test('placement is not feeding; contact requires low speed and ground, removal stops intake',()=>{
  const p=fixture();p.state.hunger=1;p.placeSugar({x:p.state.x+200,y:p.state.y});
  p.step(.1);assert.equal(p.state.feedings,0);assert.equal(p.state.sugar.remaining,6);
  p.placeSugar({x:p.state.x,y:p.state.y});p.state.speed=40;p.step(.02);
  assert.equal(p.state.feedings,0);assert.equal(p.state.sugar.remaining,6);
  for(let i=0;i<10;i++)p.step(.02);
  assert.equal(p.state.feedings,1);assert.ok(p.state.hunger<1);
  p.state.paused=true;const saved=p.snapshot();p.step(.1);assert.deepEqual(p.state,saved.state);
  p.state.paused=false;p.stimulate('gf');const left=p.state.sugar.remaining;p.step(.02);
  assert.equal(p.state.mode,'flight');assert.equal(p.state.sugar.remaining,left);
  p.removeSugar();assert.equal(p.state.sugar,null);
});
test('satiation and depletion end intake without tiny repeated feed starts',()=>{
  const p=fixture();p.state.hunger=.1;p.placeSugar({x:p.state.x,y:p.state.y});
  for(let i=0;i<200;i++)p.step(.02);
  assert.equal(p.state.feedings,1);assert.notEqual(p.state.mode,'feeding');assert.ok(p.state.hunger<.01);
  p.state.hunger=1;p.state.sugar.remaining=.01;p.step(.1);
  assert.equal(p.state.sugar,null);assert.notEqual(p.state.mode,'feeding');
});
test('old direct-feeding state migrates; new sugar and exploration continue exactly',()=>{
  const p=fixture();const old=p.snapshot();delete old.state.lifeVersion;old.state.feedingRemaining=6;old.state.mode='feeding';old.state.feedings=12;
  p.restore(old);assert.equal(p.state.feedingRemaining,0);assert.equal(p.state.feedings,12);assert.equal(p.state.sugar,null);
  p.placeSugar({x:200,y:200});for(let i=0;i<40;i++)p.step(.1);
  const q=fixture();q.restore(p.snapshot());
  for(let i=0;i<60;i++){p.step(.1);q.step(.1);}
  assert.deepEqual(p.state,q.state);assert.ok(Math.abs(p.state.exploreBias)<=.02);
});
