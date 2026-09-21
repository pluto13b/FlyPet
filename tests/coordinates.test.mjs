import test from 'node:test';
import assert from 'node:assert/strict';
import { pixel } from '../src/main/coordinates.cjs';

test('native coordinates never receive negative zero near either window origin', () => {
  for (const origin of [90, 120]) for (const offset of [-0.49, -0.2, -0.001, 0, 0.2, 0.49]) {
    const coordinate = pixel((origin + offset) - origin);
    assert.equal(Object.is(coordinate, -0), false);
    assert.equal(coordinate, 0);
  }
  assert.equal(pixel(-1920.3), -1920);
  assert.equal(pixel(-0.7), -1);
  assert.equal(pixel(1920.7), 1921);
});
