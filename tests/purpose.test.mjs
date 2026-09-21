import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Pet} from '../src/core/pet.mjs';
import {advanceMotion} from '../src/core/motion.mjs';
const graph=JSON.parse(fs.readFileSync(new URL('../data/circuit.json',import.meta.url)));
const descriptor=[1,0,0];
function pet(){const p=new Pet(graph,{id:'purpose-test'});Object.assign(p.state,{x:200,y:200,heading:0,hunger:1,nextExploreAt:1000});
  p.brain.step=()=>({gfSpikes:0,rates:{dnp09:12,dng11:25,'dna02:left':4,'dna02:right':0}});return p;}
function see(p,x=330,y=230,stamp=Date.now()){
  p.visualObservation={available:true,source:'desktop',capturedAt:stamp,scores:[.03,.03,.03],pose:{x:p.state.x,y:p.state.y,heading:p.state.heading},
    regions:[{x,y,score:.08,salience:3,radius:25,descriptor,token:String(stamp)}]};
}
test('rest and groom suppress unintended rotation even near a screen boundary',()=>{
  for(const mode of ['rest','groom','feeding']){
    const s={mode,x:30,y:30,heading:-2,speed:0,age:4,altitude:0,turnVelocity:0,gaitPhase:0};
    for(let i=0;i<200;i++)advanceMotion(s,{x:0,y:0,width:800,height:600},.02,0,1.3);
    assert.equal(s.heading,-2);assert.equal(s.x,30);assert.equal(s.y,30);
  }
});
test('an image region starts approach, persists across fresh frames and reaches actual sugar contact',()=>{
  const p=pet(),start=Date.now();p.placeSugar({x:330,y:230});
  for(let i=0;i<220;i++){
    if(i%10===0)see(p,330,230,start-300+Math.floor(i/10));
    p.step(.05);
    if(p.state.feedings)break;
  }
  assert.equal(p.state.feedings,1);assert.equal(p.state.mode,'feeding');assert.ok(p.state.hunger<1);
  assert.ok(p.state.lastIntake.cue?.token);assert.ok(p.state.age>2);
});
test('stale pixels require reobservation; disappearance and vision disable end approach',()=>{
  const p=pet(),now=Date.now();see(p,330,230,now-100);p.step(.1);see(p,330,230,now-50);p.step(.1);
  assert.equal(p.state.purpose.kind,'inspect');
  p.visualObservation=null;for(let i=0;i<10;i++)p.step(.1);
  assert.equal(p.state.purpose.phase,'reacquire');assert.ok(p.state.speed<2);
  for(let i=0;i<12;i++)p.step(.1);
  assert.equal(p.state.purpose,null);assert.match(p.state.lastPurpose.reason,/消失/);
  p.state.recentChecks=[];p.state.cueCooldownUntil=0;
  see(p,340,240,now-40);p.step(.1);see(p,340,240,now-30);p.step(.1);
  p.state.visionEnabled=false;p.step(.1);assert.equal(p.state.purpose,null);
});
test('region movement updates purpose; sugar coordinates alone cannot create a visual target',()=>{
  const p=pet(),now=Date.now();p.placeSugar({x:600,y:400});p.step(.1);assert.equal(p.state.purpose,null);
  see(p,330,230,now-100);p.step(.1);see(p,330,230,now-90);p.step(.1);
  see(p,330,270,now-80);p.step(.1);assert.equal(p.state.purpose.target.y,270);
  const q=new Pet(graph,{saved:JSON.parse(JSON.stringify(p.snapshot()))});
  assert.deepEqual(q.state.purpose,p.state.purpose);assert.deepEqual(q.state.visits,p.state.visits);
});
test('exploration changes area, neural walking output remains necessary, and threat interrupts purpose',()=>{
  const p=pet();p.state.nextExploreAt=0;
  for(let i=0;i<250;i++)p.step(.05);
  assert.ok(Math.hypot(p.state.x-200,p.state.y-200)>70);
  assert.ok(p.state.visits.length>=2);
  const q=pet();q.state.nextExploreAt=0;q.brain.step=()=>({gfSpikes:0,rates:{dnp09:0}});
  for(let i=0;i<120;i++)q.step(.05);
  assert.ok(Math.hypot(q.state.x-200,q.state.y-200)<1);
  p.brain.step=()=>({gfSpikes:1,rates:{dnp09:12}});
  p.step(.05,{x:p.state.x,y:p.state.y});assert.equal(p.state.mode,'flight');assert.equal(p.state.purpose,null);
});
