import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Brain } from '../src/core/brain.mjs';
import { Pet } from '../src/core/pet.mjs';
import { retinaSample } from '../src/core/senses.mjs';
const graph = JSON.parse(fs.readFileSync(new URL('../data/circuit.json', import.meta.url)));

test('real circuit: sensory activation reaches GF; silencing breaks that path', () => {
  const baseline = new Brain(graph), active = new Brain(graph), silenced = new Brain(graph);
  silenced.silence('gf');
  const inputs = { lc4: 0.3, lplc2: 0.3 };
  assert.equal(baseline.step(500).gfSpikes, 0);
  assert.ok(active.step(500, inputs).gfSpikes > 0);
  assert.equal(silenced.step(500, inputs).gfSpikes, 0);
});

test('cursor cannot bypass GF to escape; a direct GF pulse can initiate escape', () => {
  const pet = new Pet(graph);
  pet.brain.silence('gf');
  for (let i = 0; i < 100; i++) pet.step(0.02, { x: pet.state.x + 2, y: pet.state.y });
  assert.equal(pet.state.escapes, 0);
  pet.brain.silence('gf', false); pet.stimulate('gf');
  pet.step(0.02);
  assert.ok(pet.state.escapes > 0); assert.equal(pet.state.caption, '跑！');
});

test('snapshot restores the exact same next neural and behavioral state', () => {
  const a = new Pet(graph, { id: 'same-fly' });
  for (let i = 0; i < 75; i++) a.step(0.02);
  const saved = JSON.parse(JSON.stringify(a.snapshot()));
  const b = new Pet(graph, { saved });
  a.step(0.02); b.step(0.02);
  assert.deepEqual(a.state, b.state); assert.deepEqual(a.brain.snapshot(), b.brain.snapshot());
  assert.equal(b.state.id, 'same-fly');
});

test('pause freezes age, brain and body', () => {
  const pet = new Pet(graph); pet.state.paused = true;
  const before = pet.snapshot(); pet.step(0.1, { x: 0, y: 0 });
  const after = pet.snapshot();
  assert.deepEqual(before.state, after.state); assert.deepEqual(before.brain, after.brain);
});

test('screen sampling responds to pixel changes and settles on static input', () => {
  const args = { width: 64, height: 64, bounds: { x: 0, y: 0, width: 640, height: 640 }, fly: { x: 320, y: 320, heading: 0 } };
  const dark = retinaSample({ ...args, bitmap: Buffer.alloc(64 * 64 * 4) });
  const light = retinaSample({ ...args, bitmap: Buffer.alloc(64 * 64 * 4, 255), previous: dark.values });
  const staticLight = retinaSample({ ...args, bitmap: Buffer.alloc(64 * 64 * 4, 255), previous: light.values });
  assert.equal(dark.values.length, 126); assert.ok(light.change > 0.99); assert.equal(staticLight.change, 0);
});
