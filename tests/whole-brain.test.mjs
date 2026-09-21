import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WholeBrainBridge} from '../src/main/whole-brain.cjs';
import {Pet} from '../src/core/pet.mjs';

test('real worker output drives pet; child failure pauses rather than switching to small brain',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const graph=JSON.parse(fs.readFileSync(path.join(root,'data/circuit.json')));
  const folder=fs.mkdtempSync(path.join(root,'.cache/tmp/brain-bridge-'));
  const brain=new WholeBrainBridge(root,folder,graph,()=>{});
  try{
    await brain.ready;
    const pet=new Pet(graph,{brain});
    pet.state.age=10;pet.state.flightUntil=0;
    pet.stimulate('gf');
    brain.update(await brain.request('step',{ms:50,inputs:{},vision:[]}));
    pet.step(.02);
    assert.equal(pet.state.mode,'flight');assert.equal(pet.state.escapes,1);
    assert.equal(pet.brain.n,138639);assert.equal(pet.snapshot().version,2);
    pet.placeSugar({x:200,y:150});
    const snapshot=pet.snapshot();await brain.checkpoint(snapshot);
    const restored=new WholeBrainBridge(root,folder,graph,()=>{});
    try{
      const ready=await restored.ready;
      assert.deepEqual(ready.restoredPet.state,snapshot.state);
      assert.equal(ready.view.timeMs,brain.timeMs);
      restored.restore({kind:'whole-brain',pendingMs:899,pendingGF:0});
      assert.equal(restored.pendingMs,0);
    }finally{await restored.close();}
    // Simulate a scheduler stall while keeping the real neural worker alive.
    brain.suspended=true;brain.pendingMs=1100;
    pet.step(.1);
    assert.equal(brain.backpressured,true);assert.equal(brain.failed,null);
    const heldAge=pet.state.age,heldPosition=[pet.state.x,pet.state.y],backlog=brain.pendingMs;
    for(let i=0;i<20;i++)pet.step(.1);
    assert.equal(pet.state.age,heldAge);assert.deepEqual([pet.state.x,pet.state.y],heldPosition);
    assert.equal(brain.pendingMs,backlog);assert.equal(pet.state.paused,false);
    await brain.checkpoint(pet.snapshot()); // A recoverable delay must not disable saving.
    brain.suspended=false;brain.pump();
    for(let i=0;i<400&&brain.backpressured;i++)await new Promise(r=>setTimeout(r,20));
    assert.equal(brain.backpressured,false);assert.equal(brain.failed,null);
    pet.step(.02);assert.ok(pet.state.age>heldAge);
    const exited=new Promise(resolve=>brain.child.once('exit',resolve));brain.child.kill();await exited;
    const age=pet.state.age;pet.step(.02);
    assert.equal(pet.state.paused,true);assert.equal(pet.state.age,age);
    assert.ok(brain.failed);
  }finally{await brain.close();fs.rmSync(folder,{recursive:true,force:true});}
});
