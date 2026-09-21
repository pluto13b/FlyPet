import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Pet} from '../src/core/pet.mjs';
const graph=JSON.parse(fs.readFileSync(new URL('../data/circuit.json',import.meta.url)));
test('manual sugar feeding reduces hunger and persists without resetting identity',()=>{
  const pet=new Pet(graph,{id:'hungry-fly'});pet.state.hunger=1;pet.brain.silence('gf');pet.placeSugar({x:pet.state.x,y:pet.state.y});
  for(let i=0;i<100;i++)pet.step(.02);
  assert.equal(pet.state.mode,'feeding');assert.equal(pet.state.caption,'吃。');assert.ok(pet.state.hunger<.78);
  const restored=new Pet(graph,{saved:JSON.parse(JSON.stringify(pet.snapshot()))});
  assert.equal(restored.state.id,'hungry-fly');assert.deepEqual(restored.state.sugar,pet.state.sugar);
  restored.state.paused=true;const remaining=restored.state.sugar.remaining,hunger=restored.state.hunger;
  restored.step(.1);assert.equal(restored.state.sugar.remaining,remaining);assert.equal(restored.state.hunger,hunger);
});
