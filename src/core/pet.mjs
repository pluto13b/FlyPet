import { Brain, MODEL } from './brain.mjs';
import { cursorSense, clamp } from './senses.mjs';
import { advanceMotion } from './motion.mjs';
import { visualGuidance } from './visual-guidance.mjs';
import { peripheralGuidance } from './peripheral-guidance.mjs';
import {updatePurpose,endPurpose,eligibleCue} from './purpose.mjs';

export class Pet {
  constructor(graph, { id = 'fly-01', bounds = { x: 0, y: 0, width: 1280, height: 720 }, saved, brain } = {}) {
    this.brain = brain ?? new Brain(graph);
    this.bounds = bounds;
    this.state = { id, bornAt: new Date().toISOString(), age: 0,
      x: bounds.x + bounds.width * 0.55, y: bounds.y + bounds.height * 0.55,
      heading: -0.5, speed: 0, mode: 'rest', caption: '…', hunger: 0.25, fatigue: 0.1,
      arousal: 0, stress: 0, escapes: 0, flightUntil: 0, decision: '低活动，停留',
      flightStartedAt: -10, escapeHeading: -0.5, turnVelocity: 0, altitude: 0, gaitPhase: 0,
      feedingRemaining: 0, feedings: 0,
      lifeVersion: 1, sugar: null, feedingActive: false, lastIntake: null,
      exploreRng: 1, exploreUntil: 0, exploreBias: 0, behaviorUntil: 0,
      threatUntil: -1, manualGFUntil: -1,
      visualSteeringEnabled:true,
      purposeVersion:1,purpose:null,lastPurpose:null,visits:[],nextVisitAt:0,nextExploreAt:5,walkDrive:0,
      recentChecks:[],pendingCue:null,lastRegionStamp:0,cueCooldownUntil:0,
      ignoreInspector:false,
      paused: false, cursorEnabled: true, visionEnabled: true, showCaption: true };
    this.previousPointer = null;
    this.sense = { strength: 0, left: 0, right: 0, distance: null };
    this.vision = { eyes: { left: [], right: [] }, change: 0, luminance: 0, status: '等待屏幕采样', capturedAt: 0 };
    this.events = [];
    this.visualObservation=null;this.visualIntent={active:false};
    this.peripheralObservation=null;this.peripheralIntent={active:false};
    this.remainderMs = 0;
    if (saved) this.restore(saved);
    if (!saved?.state?.lifeVersion) {
      let seed=2166136261;for(const c of this.state.id)seed=Math.imul(seed^c.charCodeAt(0),16777619);
      this.state.exploreRng=seed>>>0;
    }
    this.keepOnScreen();
  }

  keepOnScreen() {
    const b = this.bounds, s = this.state;
    const x = clamp(s.x, b.x + 26, b.x + b.width - 26);
    const y = clamp(s.y, b.y + 26, b.y + b.height - 26);
    s.x = x; s.y = y;
  }

  event(text) {
    this.events.unshift({ time: this.state.age, text });
    this.events.length = Math.min(14, this.events.length);
  }

  placeSugar(point) {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
    this.state.sugar={x:point.x,y:point.y,radius:20,remaining:6};
    this.state.feedingActive=false;
    this.event('世界：放下一滴糖水，接触并停下后才能摄入');
    return true;
  }

  removeSugar() {
    this.state.sugar=null;this.state.feedingActive=false;
    this.event('世界：移除糖水');
  }

  stimulate(group) {
    if(group==='gf')this.state.manualGFUntil=this.state.age+.5;
    return this.brain.stimulate(group,.3,180);
  }

  random() {
    this.state.exploreRng=(Math.imul(this.state.exploreRng,1664525)+1013904223)>>>0;
    return this.state.exploreRng/4294967296;
  }

  sugarContact() {
    const s=this.state,f=s.sugar;
    return !!f&&f.remaining>0&&s.age>=s.flightUntil&&(s.altitude??0)<.01&&Math.hypot(s.x-f.x,s.y-f.y)<=f.radius;
  }

  step(dt, pointer = null) {
    const s = this.state;
    if (this.brain.failed) { s.paused = true; s.decision = this.brain.failed; s.caption = '…'; return this.view(); }
    if (s.paused) { this.previousPointer = pointer; return this.view(); }
    if (this.brain.backpressured) {
      this.previousPointer=pointer;this.brain.pump?.();
      return this.view(); // Preserve behavior/age, not a permanent pause; queued brain work continues.
    }
    dt = clamp(dt, 0, 0.1);
    s.age += dt;
    this.sense = cursorSense(s.cursorEnabled ? pointer : null, this.previousPointer, s, dt);
    this.previousPointer = pointer;
    s.hunger = clamp(s.hunger + dt / 7200);
    if(s.age>=s.exploreUntil){
      s.exploreBias=clamp(s.exploreBias+(this.random()-.5)*.02,-.02,.02);
      s.exploreUntil=s.age+2+3*this.random();
    }
    // Engineering tonic/exploration inputs, distinct from visual targets.
    const exploration=(1-s.fatigue)*.25;
    const pixelDrive = !this.brain.isWholeBrain && s.visionEnabled && Date.now() - this.vision.capturedAt < 1800
      ? clamp(this.vision.change * 1.5, 0, 0.22) : 0;
    const inputs = {
      'lc4:left': (this.sense.left + pixelDrive) * MODEL.sensoryGain,
      'lplc2:left': (this.sense.left + pixelDrive) * MODEL.sensoryGain,
      'lc4:right': (this.sense.right + pixelDrive) * MODEL.sensoryGain,
      'lplc2:right': (this.sense.right + pixelDrive) * MODEL.sensoryGain,
      dnp09: 0.018 + exploration * 0.065 + s.hunger * 0.01 + (s.purpose?.phase!=='verify'&&s.purpose ? .05 : 0),
      'dna02:left': 0.015 + Math.max(0,s.exploreBias),
      'dna02:right': 0.015 + Math.max(0,-s.exploreBias),
      dng11: s.mode==='rest' ? .025 : .008,
    };
    this.remainderMs += dt * 1000;
    const ticks = Math.floor(this.remainderMs + 1e-8);
    this.remainderMs -= ticks;
    if(this.brain.isWholeBrain) this.brain.vision = s.visionEnabled && Date.now()-this.vision.capturedAt<1800
      ? this.vision.values ?? [] : [];
    const output = this.brain.step(ticks, inputs), r = output.rates;
    s.walkDrive+=((r.dnp09??0)-s.walkDrive)*(1-Math.exp(-dt/.45));
    s.arousal += (clamp((r.lc4 ?? 0) / 100) - s.arousal) * Math.min(1, dt * 3);
    s.stress = Math.max(0, s.stress - dt * 0.06);
    if(this.sense.strength>=.25)s.threatUntil=s.age+.3;
    const manual=s.age<=s.manualGFUntil;
    if (output.gfSpikes > 0 && (manual||s.age<=s.threatUntil) && (manual||s.age > s.flightUntil + 0.6)) {
      s.flightStartedAt = s.age; s.flightUntil = s.age + 1.2; s.escapes++; s.stress = clamp(s.stress + 0.3);
      s.escapeHeading = this.sense.strength > 0.05 ? this.sense.bearing + Math.PI : s.heading;
      s.decision = `${manual?'实验手动刺激':'近期鼠标威胁'} + GF 放电 ${output.gfSpikes} 次 → 逃逸`;
      s.manualGFUntil=-1;
      this.event(s.decision);
    }
    const oldMode = s.mode;
    this.visualIntent=visualGuidance(this.visualObservation,s,this.visualIntent);
    this.peripheralIntent=this.visualIntent.active?{active:false,reason:'前方价值优先',cooldownUntil:this.peripheralIntent.cooldownUntil}:peripheralGuidance(this.peripheralObservation,s,this.peripheralIntent);
    this.purposeIntent=updatePurpose(s,this.visualObservation,this.bounds,()=>this.random(),dt);
    if(this.peripheralIntent.active&&s.purpose?.kind==='explore'){
      endPurpose(s,'周边出现新变化，先定向查看',2.5);this.purposeIntent={active:false};
    }
    let walkingSpeed = 0;
    if (s.age < s.flightUntil) { s.mode = 'flight'; }
    else if(this.sugarContact()&&s.hunger>(oldMode==='feeding'?0:.05)){
      s.mode='feeding';s.decision='世界接触糖水 → 减速停下，按实际摄入降低饥饿';
    } else if(s.fatigue>=.9){s.mode='rest';s.decision='身体疲劳 → 休息';}
    else if(this.purposeIntent.active){
      s.mode=this.purposeIntent.phase==='verify'||this.purposeIntent.phase==='reacquire'?'rest':'walk';
      s.decision=this.purposeIntent.reason;
    }
    else {
      let next='rest';
      if(oldMode==='walk'&&(r.dnp09??0)>1)next='walk';
      else if(oldMode==='groom'&&(r.dng11??0)>5)next='groom';
      else if((r.dnp09??0)>2)next='walk';
      else if((r.dng11??0)>8)next='groom';
      if(['walk','rest','groom'].includes(oldMode)&&s.age<s.behaviorUntil)next=oldMode;
      s.mode=next;
      s.decision=next==='walk'?'DNp09 行走读出 + 工程探索偏置':next==='groom'?'DNg11 梳理读出 + 行为保持':'低活动读出 + 身体休息';
    }
    if(this.peripheralIntent.active&&s.mode==='rest'&&s.age>=s.behaviorUntil&&s.fatigue<.9)s.mode='walk';
    if(s.mode!==oldMode)s.behaviorUntil=s.age+({walk:1.2,groom:1.5,rest:.8}[s.mode]??0);
    if(s.mode==='walk')walkingSpeed=clamp((r.dnp09??0)*1.1,10,48);
    let turn = clamp(((r['dna02:right'] ?? 0) - (r['dna02:left'] ?? 0)) * 0.025, -1.3, 1.3);
    if(s.mode==='walk'&&this.purposeIntent.active){
      turn=this.purposeIntent.turn+.08*turn;
      // A continuous motor readout preserves neural dependence without stopping at each rate trough.
      walkingSpeed=32*s.walkDrive/(s.walkDrive+4)*this.purposeIntent.speedScale;
    }else if(s.mode==='walk'&&this.visualIntent.active&&s.age>s.threatUntil){
      turn=.35*turn+this.visualIntent.turn;
      s.decision=this.visualIntent.reason+' + DNp09 行走读出';
    }else if(s.mode==='walk'&&this.peripheralIntent.active&&s.age>s.threatUntil){
      turn=this.peripheralIntent.turn;walkingSpeed=Math.min(walkingSpeed,12);
      s.decision=this.peripheralIntent.reason;
    }
    advanceMotion(s, this.bounds, dt, walkingSpeed, s.mode==='feeding'?0:turn);
    const eating=s.mode==='feeding'&&this.sugarContact()&&s.speed<2&&s.hunger>0;
    if(eating){
      if(!s.feedingActive){s.feedings++;this.event(eligibleCue(s)?'实际摄入：可配对最近视觉线索':'实际摄入：无可靠视觉配对，仅更新身体');}
      const consumed=Math.min(dt,s.sugar.remaining,s.hunger/.12);
      s.sugar.remaining=Math.max(0,s.sugar.remaining-consumed);s.hunger=clamp(s.hunger-consumed*.12);
      s.lastIntake={time:s.age,seconds:consumed,x:s.sugar.x,y:s.sugar.y,meal:s.feedings,cue:eligibleCue(s)};
      if(s.sugar.remaining<=1e-8)s.sugar=null;
      if(s.hunger===0||!s.sugar){s.mode='rest';s.behaviorUntil=s.age+.8;s.decision='摄入结束 → 休息';endPurpose(s,'实际摄入完成',4);}
    }
    s.feedingActive=eating&&!!s.sugar&&s.hunger>0;
    s.fatigue = clamp(s.fatigue + dt * (s.speed > 0 ? 1 / 1800 : -1 / 700));
    this.keepOnScreen();
    s.caption = s.mode === 'flight' ? '跑！' : s.mode === 'feeding' ? '吃。' : s.hunger > 0.6 ? '饿…' : s.mode === 'walk' ? '走走。' : s.mode === 'groom' ? '搓搓。' : '…';
    if(this.purposeIntent?.active&&!['flight','feeding'].includes(s.mode))s.caption=this.purposeIntent.kind==='inspect'?'过去看看。':'找找。';
    if (oldMode !== s.mode && s.mode !== 'flight') this.event(s.decision);
    return this.view();
  }

  view() {
    return { state: { ...this.state, sugar:this.state.sugar?{...this.state.sugar}:null }, visualIntent:this.visualIntent, peripheralIntent:this.peripheralIntent, contact:this.sugarContact(), sense: { ...this.sense }, vision: this.vision,
      rates: this.brain.groupRates(), spikes: this.brain.lastSpikes,
      neuronRates: [...this.brain.rates], totalSpikes: this.brain.totalSpikes,
      simulatedMs: this.brain.timeMs, events: this.events,
      gfSilenced: this.brain.groups.gf.every(i => this.brain.silenced.has(i)), brainInfo: this.brain.info ?? null };
  }

  snapshot() {
    return { version: this.brain.isWholeBrain ? 2 : 1, savedAt: new Date().toISOString(), state: structuredClone(this.state),
      brain: this.brain.snapshot(), remainderMs: this.remainderMs, events: this.events };
  }

  restore(saved) {
    if (![1,2].includes(saved.version) || !saved.state?.id || !Number.isFinite(saved.state.x) || !Number.isFinite(saved.state.y))
      throw new Error('无法读取个体存档，原文件已保留。');
    this.state = { ...this.state, ...saved.state };
    if(!saved.state.purposeVersion)this.state.nextExploreAt=this.state.age+5;
    this.state.sugar=saved.state.lifeVersion&&saved.state.sugar?{...saved.state.sugar}:null;
    this.state.feedingRemaining=0;this.state.lifeVersion=1;
    if(!saved.state.lifeVersion){this.state.feedingActive=false;if(this.state.mode==='feeding')this.state.mode='rest';}
    this.brain.restore(saved.brain);
    this.remainderMs = saved.remainderMs ?? 0;
    this.events = saved.events ?? [];
  }
}
