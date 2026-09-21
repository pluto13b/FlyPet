import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMotion, angleDelta } from '../src/core/motion.mjs';
const bounds={x:0,y:0,width:1920,height:1080};
const state=()=>({age:0,flightStartedAt:0,flightUntil:1.2,mode:'flight',x:960,y:540,
  speed:0,heading:0,escapeHeading:Math.PI,turnVelocity:0,altitude:0,gaitPhase:0});

test('escape accelerates and turns continuously through takeoff and landing',()=>{
  const s=state(),trace=[];
  for(let i=0;i<80;i++){
    const old={...s};s.age=i*.02;if(s.age>=1.2)s.mode='rest';
    advanceMotion(s,bounds,.02,0,0);trace.push({...s});
    assert.ok(Math.abs(s.speed-old.speed)<=19.001);
    assert.ok(Math.abs(angleDelta(s.heading,old.heading))<=.141);
    assert.ok(Math.abs(s.altitude-old.altitude)<.18);
  }
  assert.equal(trace[0].altitude,0);assert.ok(trace[20].altitude>.99);
  assert.ok(trace[55].altitude<.3);assert.equal(trace[60].altitude,0);
  assert.equal(trace.at(-1).speed,0);
});

test('wall avoidance bends the path without instantly replacing heading',()=>{
  const s={...state(),x:1880,heading:0,escapeHeading:0,speed:100,age:.5};
  advanceMotion(s,bounds,.02,0,0);
  assert.ok(Math.abs(s.heading)<=.14);assert.ok(s.turnVelocity>0);
  assert.ok(Number.isFinite(s.x));
});
