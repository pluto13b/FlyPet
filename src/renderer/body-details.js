import * as THREE from '../../node_modules/three/build/three.module.js';

// Locally authored surface detail on the attributed upstream geometry.
export function refineBody(model) {
  const { root, thorax, head, eyes, abdomen, foldedWings } = model;
  thorax.material = new THREE.MeshStandardMaterial({ color: 0x514237, roughness: 0.78 });
  head.material = new THREE.MeshStandardMaterial({ color: 0x6c5441, roughness: 0.66 });
  const textureCanvas = document.createElement('canvas'); textureCanvas.width=256; textureCanvas.height=128;
  const ctx=textureCanvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#302820');gradient.addColorStop(.5,'#997346');gradient.addColorStop(1,'#b58d59');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,128);
  for(let row=0;row<6;row++){ctx.fillStyle='rgba(35,27,24,.67)';ctx.fillRect(0,8+row*20,256,5);ctx.fillStyle='rgba(213,171,112,.12)';ctx.fillRect(0,14+row*20,256,1);}
  const abdomenMap=new THREE.CanvasTexture(textureCanvas);abdomenMap.colorSpace=THREE.SRGBColorSpace;
  abdomen.material=new THREE.MeshStandardMaterial({map:abdomenMap,roughness:.7});
  const eyeCanvas=document.createElement('canvas');eyeCanvas.width=256;eyeCanvas.height=128;
  const ectx=eyeCanvas.getContext('2d');ectx.fillStyle='#63150d';ectx.fillRect(0,0,256,128);
  for(let y=3;y<128;y+=6)for(let x=3;x<256;x+=6){ectx.fillStyle='#a44428';ectx.beginPath();ectx.arc(x+(y%12?0:3),y,2.3,0,Math.PI*2);ectx.fill();}
  const eyeMap=new THREE.CanvasTexture(eyeCanvas);eyeMap.colorSpace=THREE.SRGBColorSpace;
  for(const eye of eyes) eye.material=new THREE.MeshStandardMaterial({map:eyeMap,bumpMap:eyeMap,bumpScale:.13,roughness:.5});
  const hair=[];
  for(let i=0;i<110;i++){
    const theta=i*2.399963, z=.08+.9*((i*.6180339)%1),r=Math.sqrt(1-z*z);
    const x=r*Math.cos(theta),y=r*Math.sin(theta);
    const p=new THREE.Vector3(x*4.37,y*5.29+2.5,z*3.91+6.2);
    const end=p.clone().add(new THREE.Vector3(x,y,z).multiplyScalar(.5+(i%5)*.14));
    hair.push(...p.toArray(),...end.toArray());
  }
  for(const leg of model.legs){
    const points=[];for(let i=0;i<8;i++){const x=.6+i*leg.geometry.tibia/9;points.push(x,0,.1,x+.15,.2+(i%2)*.2,.55);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    leg.knee.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x241c18,transparent:true,opacity:.7})));
  }
  const hairGeometry=new THREE.BufferGeometry();hairGeometry.setAttribute('position',new THREE.Float32BufferAttribute(hair,3));
  root.add(new THREE.LineSegments(hairGeometry,new THREE.LineBasicMaterial({color:0x231c17,transparent:true,opacity:.8})));
  const branches=[[[0,-.6],[1.3,-5],[1.7,-10],[.7,-15]],[[0,-.6],[-.8,-5],[-1.6,-10],[-.4,-15]],[[0,-.6],[.1,-7],[.2,-15]],[[1.3,-5],[-.8,-5]],[[1.7,-10],[.1,-9],[-1.6,-10]]];
  for(const wing of foldedWings.children){
    const vertices=[];for(const line of branches)for(let k=1;k<line.length;k++)vertices.push(...line[k-1],.09,...line[k],.09);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    wing.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x797164,transparent:true,opacity:.55})));
    wing.material=new THREE.MeshStandardMaterial({color:0xc3c7bc,roughness:.6,transparent:true,opacity:.23,side:THREE.DoubleSide,depthWrite:false});
  }
}
