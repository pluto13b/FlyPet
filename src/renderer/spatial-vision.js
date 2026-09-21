export function drawSpatial(canvas,vision,channel){
  const ctx=canvas.getContext('2d'),width=canvas.clientWidth,height=canvas.clientHeight,ratio=Math.min(2,devicePixelRatio);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const values=vision.spatialResponses?.[channel]??[];
  const spacing=Math.max(1,Math.min((width-18)/32,(height-22)/32));let i=0;
  for(let u=-15;u<=15;u++)for(let v=Math.max(-15,-15-u);v<=Math.min(15,15-u);v++){
    const a=values[i++]??0,x=width/2+v*spacing,y=height/2+(u+v/2)*spacing;
    const strength=Math.min(1,Math.abs(a)*3);
    ctx.fillStyle=a>=0?`rgba(104,220,178,${.08+.92*strength})`:`rgba(192,133,217,${.08+.92*strength})`;
    ctx.beginPath();ctx.arc(x,y,spacing*.44,0,Math.PI*2);ctx.fill();
  }
  canvas.dataset.columns=String(values.length);canvas.dataset.channel=channel;
}

export function drawPeripheral(canvas,view){
  const ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight,ratio=Math.min(2,devicePixelRatio);
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  const cx=w/2,cy=h/2,r=Math.max(20,Math.min(w,h)/2-23),labels=['前','右前','右','右后','后','左后','左','左前'];
  for(let i=0;i<8;i++){
    const s=view?.sectors?.[i],a=-Math.PI/2+i*Math.PI/4;
    const light=s?.brightness??0,change=Math.min(1,(s?.change??0)*3);
    ctx.beginPath();ctx.arc(cx,cy,r,a-Math.PI/8+.025,a+Math.PI/8-.025);ctx.arc(cx,cy,r*.45,a+Math.PI/8-.025,a-Math.PI/8+.025,true);ctx.closePath();
    ctx.fillStyle=!s?.samples?'#26302e':change>.1?`rgba(244,180,71,${.3+.7*change})`:`rgb(${Math.round(35+light*105)},${Math.round(50+light*105)},${Math.round(48+light*105)})`;ctx.fill();
    ctx.fillStyle='#c0cdbb';ctx.font='10px Microsoft YaHei';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(labels[i],cx+Math.cos(a)*(r+13),cy+Math.sin(a)*(r+13));
  }
  ctx.fillStyle='#baddaf';ctx.beginPath();ctx.moveTo(cx,cy-10);ctx.lineTo(cx-6,cy+6);ctx.lineTo(cx+6,cy+6);ctx.closePath();ctx.fill();
  ctx.fillStyle='#aabbab';ctx.fillText('周边 480 DIP',cx,h-9);
  canvas.dataset.sectors=String(view?.sectors?.length??0);
}
