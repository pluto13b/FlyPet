import * as THREE from '../../node_modules/three/build/three.module.js';
import { buildFlyModel } from '../../vendor/desktop-fly/geometry.js';
import { refineBody } from './body-details.js';
import { angleDelta } from '../core/motion.mjs';

export function bodyView(canvas, scale = 1.65) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  const halfHeight = 120 * canvas.clientHeight / canvas.clientWidth;
  const camera = new THREE.OrthographicCamera(-120,120,halfHeight,-halfHeight,0.1,1000);
  camera.position.set(0,0,250); camera.up.set(0,1,0); camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x7d6546,2.2));
  const light = new THREE.DirectionalLight(0xffffff,2.4); light.position.set(-50,60,120); scene.add(light);
  const model = buildFlyModel(); refineBody(model); scene.add(model.root);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const shadowContext=shadowCanvas.getContext('2d');
  const falloff=shadowContext.createRadialGradient(32,32,3,32,32,32);falloff.addColorStop(0,'rgba(0,0,0,.7)');falloff.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=falloff;shadowContext.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,opacity:.2,depthWrite:false}));
  shadow.scale.set(1,1.3,1);shadow.position.z=-2;scene.add(shadow);
  let target=null, lastTime=0, pose=null,lastDraw=0,lastPausedKey='',frames=0;
  const damp=(a,b,dt,rate=20)=>a+(b-a)*(1-Math.exp(-rate*dt));
  function draw(now){
    requestAnimationFrame(draw);
    if(!target)return;
    if(document.body.dataset.renderActive==='false'||canvas.clientWidth<1||canvas.clientHeight<1){lastTime=now;return;}
    const moving=target.mode==='flight'||target.mode==='walk';
    if(now-lastDraw<1000/(moving?60:target.mode==='rest'?15:30))return;
    const pausedKey=[target.paused,target.x,target.y,target.heading,target.mode].join('|');
    if(target.paused&&pausedKey===lastPausedKey)return;
    lastPausedKey=target.paused?pausedKey:'';lastDraw=now;
    const s=target,dt=s.paused?0:Math.min(.05,(now-(lastTime||now))/1000);lastTime=now;
    if(!pose)pose={x:s.x,y:s.y,heading:s.heading,height:s.altitude??0,speed:s.speed,turn:0,groom:0,feed:0,phase:s.gaitPhase??0,wing:0};
    if(s.paused){pose.x=s.x;pose.y=s.y;pose.heading=s.heading;}
    pose.x=damp(pose.x,s.x,dt,35);pose.y=damp(pose.y,s.y,dt,35);
    pose.heading+=angleDelta(s.heading,pose.heading)*(1-Math.exp(-30*dt));
    pose.height=damp(pose.height,s.altitude??0,dt);
    pose.speed=damp(pose.speed,s.speed,dt);
    pose.turn=damp(pose.turn,s.turnVelocity??0,dt,12);
    pose.groom=damp(pose.groom,s.mode==='groom'?1:0,dt,10);
    pose.feed=damp(pose.feed,s.mode==='feeding'?1:0,dt,10);
    pose.phase=damp(pose.phase,s.gaitPhase??0,dt,35);
    const flight=s.mode==='flight',elapsed=s.age-(s.flightStartedAt??0),remaining=s.flightUntil-s.age;
    const wingTarget=flight?Math.min(1,Math.max(0,elapsed/.08),Math.max(0,remaining/.12)):0;
    pose.wing=damp(pose.wing,wingTarget,dt,24);
    const height=pose.height,walk=Math.min(1,pose.speed/30)*(1-height);
    model.root.rotation.set(-.13*height,-pose.turn*.065*height,-pose.heading-Math.PI/2,'ZYX');
    model.root.position.x=pose.x-s.x;
    model.root.position.y=-(pose.y-s.y)+height*7;
    model.root.position.z=height*8;
    model.root.scale.setScalar(scale*(1+height*.07));
    for(const leg of model.legs){
      const phase=pose.phase+leg.phase*Math.PI*2;
      const swing=Math.sin(phase),lift=Math.max(0,Math.cos(phase));
      const grooming=pose.groom*(leg.isFront?1:0),t=s.age;
      leg.angle=walk*swing*.27*(1-height)+grooming*(.65+Math.sin(t*22)*.18);
      leg.lift=height*.58+walk*lift*.28+grooming*.48;
      leg.kneeAngle=.75+height*.48+walk*lift*.15;
      leg.apply();
    }
    model.foldedWings.visible=true;
    model.foldedWings.children.forEach((wing,i)=>{
      const side=i===0?-1:1;
      wing.rotation.z=side*(.13+pose.wing*(1.25+.16*Math.sin(s.age*135)));
      wing.rotation.y=side*pose.wing*.18*Math.sin(s.age*135);
      wing.material.opacity=.23-.1*pose.wing;
    });
    for(const wing of [model.blurWingL,model.blurWingR]){wing.visible=pose.wing>.02;wing.material.opacity=pose.wing*.12;}
    model.abdomen.scale.z=.75+Math.sin(s.age*3)*.012;
    model.head.rotation.z=Math.sin(s.age*2.7)*.022*(1-height);
    model.proboscis.scale.y=1+pose.feed*(.5+.12*Math.sin(s.age*13));
    model.proboscis.rotation.x=-.5+pose.feed*.3;
    shadow.scale.set(scale*(1+height*.3),scale*(1.3+height*.3),1);
    shadow.material.opacity=.13-height*.09;
    renderer.render(scene,camera);
    canvas.dataset.frames=String(++frames);
  }
  requestAnimationFrame(draw);
  return s=>{target=s;};
}
