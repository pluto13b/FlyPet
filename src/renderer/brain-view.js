import * as THREE from '../../node_modules/three/build/three.module.js';
import { pointCloud } from '../../vendor/desktop-fly/point-cloud.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

export async function brainView(canvas, graph) {
  const [meta,buffer]=await Promise.all([
    fetch('../../data/brain-view/metadata.json').then(r=>r.json()),
    fetch('../../data/brain-view/positions.f32').then(r=>r.arrayBuffer()),
  ]);
  const positions=new Float32Array(buffer);
  if(positions.length!==meta.count*3)throw new Error('解剖坐标文件长度不正确');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x0d2022);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-12,12,6,-6,.1,100);
  camera.position.set(0,.3,30);camera.lookAt(0,0,0);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.enablePan=false;controls.minZoom=.5;controls.maxZoom=5;
  controls.autoRotate=false;controls.autoRotateSpeed=.45;
  const cloud=pointCloud(positions,new Float32Array(positions.length).fill(.94),.95);
  cloud.material.sizeAttenuation=false;cloud.material.opacity=.38;
  cloud.renderOrder=0;scene.add(cloud);

  const activePositions=new Float32Array(graph.neurons.length*3),activeColors=new Float32Array(graph.neurons.length*3);
  const active=pointCloud(activePositions,activeColors,6);
  active.material.sizeAttenuation=false;active.material.blending=THREE.NormalBlending;active.material.opacity=.85;
  const sprite=document.createElement('canvas');sprite.width=sprite.height=32;
  const context=sprite.getContext('2d'),gradient=context.createRadialGradient(16,16,1,16,16,16);
  gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.3,'rgba(255,255,255,.9)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=gradient;context.fillRect(0,0,32,32);
  active.material.map=new THREE.CanvasTexture(sprite);active.material.alphaTest=.015;
  active.renderOrder=1;scene.add(active);active.geometry.setDrawRange(0,0);
  canvas.dataset.points=String(meta.count);canvas.dataset.renderer='three-webgl';
  document.getElementById('brain-anatomy').textContent=`${meta.count.toLocaleString()} 个解剖坐标 · ${meta.mapped_probes} 个活动探针`;

  const rotate=document.getElementById('brain-rotate'),activity=document.getElementById('brain-activity');
  rotate.onclick=()=>{controls.autoRotate=!controls.autoRotate;rotate.textContent=`自动旋转：${controls.autoRotate?'开':'关'}`;};
  activity.onclick=()=>{active.visible=!active.visible;activity.textContent=`活动：${active.visible?'开':'关'}`;canvas.dataset.activity=String(active.visible);};
  document.getElementById('brain-reset').onclick=()=>{camera.position.set(0,.3,30);camera.up.set(0,1,0);camera.zoom=1;controls.target.set(0,0,0);camera.updateProjectionMatrix();controls.update();};
  let width=0,height=0,latest=null,last=0,dirty=true;
  controls.addEventListener('change',()=>{dirty=true;});
  function frame(now){
    requestAnimationFrame(frame);
    if(document.body.dataset.renderActive==='false'){last=now;return;}
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<1||h<1)return;
    const viewportHeight=Math.max(1,h-46);
    if(w!==width||h!==height){
      width=w;height=h;renderer.setSize(w,h,false);
      const aspect=w/viewportHeight,halfH=Math.max(5.4,11/aspect);
      camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;
      camera.updateProjectionMatrix();
      dirty=true;
    }
    controls.update(Math.min(.05,(now-(last||now))/1000));last=now;
    if(!dirty)return;
    renderer.setViewport(0,46,w,viewportHeight);renderer.render(scene,camera);
    dirty=false;
    canvas.dataset.rendered='true';
    canvas.dataset.frames=String(Number(canvas.dataset.frames??0)+1);
    canvas.dataset.azimuth=controls.getAzimuthalAngle().toFixed(3);canvas.dataset.zoom=camera.zoom.toFixed(3);
  }
  requestAnimationFrame(frame);
  return view=>{
    if(view.simulatedMs===latest)return;latest=view.simulatedMs;
    let count=0;
    for(let i=0;i<graph.neurons.length;i++){
      const rate=view.neuronRates[i]??0;if(rate<.5)continue;
      const neuron=graph.neurons[i],strength=Math.min(1,rate/60),k=count*3;
      const color=neuron.role==='gf'?[1,.87,.23]:['lc4','lplc2'].includes(neuron.role)?[.3,.95,.85]:[1,.46,.2];
      activePositions.set(neuron.pos,k);
      for(let c=0;c<3;c++)activeColors[k+c]=color[c]*(.4+.6*strength);
      count++;
    }
    active.geometry.attributes.position.needsUpdate=true;active.geometry.attributes.color.needsUpdate=true;
    active.geometry.setDrawRange(0,count);canvas.dataset.activeProbes=String(count);
    dirty=true;
  };
}
