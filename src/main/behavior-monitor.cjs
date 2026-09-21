const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {analyze,markdown,trajectory}=require('./behavior-report.cjs');

function samplePet(pet,vision,saving=false){
  const s=pet.state,b=pet.brain,v=vision?.view??{},now=Date.now();
  const motor=s.mode==='walk'?(s.purpose?.kind==='inspect'||s.decision.startsWith('视觉')?'visual-value':s.decision.startsWith('周边变化')?'peripheral':'neural-explore'):s.mode;
  return {id:s.id,age:s.age,brainMs:b.timeMs,x:s.x,y:s.y,heading:s.heading,speed:s.speed,
    bounds:{...pet.bounds},mode:s.mode,reason:s.decision,motor,hunger:s.hunger,fatigue:s.fatigue,
    arousal:s.arousal,escapes:s.escapes,feedings:s.feedings,flightUntil:s.flightUntil,
    purpose:s.purpose?{kind:s.purpose.kind,phase:s.purpose.phase,started:s.purpose.started,lastSeen:s.purpose.lastSeen,
      target:{x:s.purpose.target.x,y:s.purpose.target.y,score:s.purpose.target.score}}:null,
    lastPurpose:s.lastPurpose?{...s.lastPurpose}:null,visitedCells:s.visits?.length??0,learning:v.learning??null,
    switches:{vision:s.visionEnabled,steering:s.visualSteeringEnabled,cursor:s.cursorEnabled},
    mouse:{strength:pet.sense.strength,distance:pet.sense.distance},
    sugar:s.sugar?{...s.sugar}:null,contact:pet.sugarContact(),feedingActive:s.feedingActive,
    visual:{active:!!pet.visualIntent.active,reason:pet.visualIntent.reason??null,
      peripheralActive:!!pet.peripheralIntent.active,peripheralReason:pet.peripheralIntent.reason??null,
      scores:v.valueView?.scores??null,frameAgeMs:v.valueView?.capturedAt?now-v.valueView.capturedAt:null,
      source:vision?.source??null,engine:v.engine??null,frames:v.frames??0,computeMs:v.wallMs??null},
    rates:b.groupRates(),
    runtime:{status:b.failed?'failed':s.paused?'paused':saving?'saving':b.backpressured?'catchup':'running',
      pendingMs:b.pendingMs??0,computeMs:b.info?.computeMs??0,catchups:b.catchups??0,error:b.failed??null}};
}

class BehaviorMonitor{
  constructor({root,getSample,getEvents=()=>[],getIntake=()=>null,log=()=>{}}){
    this.root=root;this.getSample=getSample;this.getEvents=getEvents;this.getIntake=getIntake;this.log=log;
    this.active=null;this.last=null;this.finishing=null;this.error=null;this.url=null;
  }
  status(){
    const a=this.active;
    return {url:this.url,error:this.error,recording:!!a,writing:!!this.finishing,
      session:a?{id:a.meta.id,startedAt:a.meta.startedAt,durationSeconds:a.meta.durationSeconds,
        elapsedSeconds:(performance.now()-a.start)/1000,samples:a.samples.length,directory:a.directory}:this.last,
      lastReport:this.last?path.join(this.last.directory,'report.md'):null};
  }
  start(durationSeconds=1800){
    if(this.active||this.finishing)throw Object.assign(new Error('已有观察正在记录或生成报告'),{status:409});
    if(!Number.isFinite(durationSeconds)||durationSeconds<1||durationSeconds>3600)
      throw Object.assign(new Error('durationSeconds 必须为 1–3600 秒'),{status:400});
    const initial=this.getSample(),startedAt=new Date().toISOString();
    const id=startedAt.replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),directory=path.join(this.root,id);
    fs.mkdirSync(directory,{recursive:true});
    const meta={id,petId:initial.id,startedAt,durationSeconds,sampleHz:10,coordinateUnit:'Electron DIP',
      endpoint:'observation only',finished:false};
    fs.writeFileSync(path.join(directory,'session.json'),JSON.stringify(meta,null,2));
    const stream=fs.createWriteStream(path.join(directory,'samples.jsonl'));
    const a={directory,meta,stream,start:performance.now(),samples:[],events:[],seen:new WeakSet(this.getEvents()),
      intakeTime:this.getIntake()?.time??-1,workMs:0,maxWorkMs:0};
    this.active=a;this.error=null;
    stream.on('error',e=>{this.error=e.message;this.log('行为记录写入失败：'+e.message);void this.stop('write-error');});
    this.sample();
    a.interval=setInterval(()=>this.sample(),100);
    a.timeout=setTimeout(()=>{void this.stop('completed');},durationSeconds*1000);
    return this.status();
  }
  write(record){
    const a=this.active;if(!a)return;
    // Stop the recorder alone if disk cannot keep up; never block the brain on telemetry.
    if(a.stream.writableLength>4*1024*1024){this.error='观测文件写入积压超过 4 MB';void this.stop('write-backpressure');return;}
    a.stream.write(JSON.stringify(record)+'\n');
  }
  event(type,data){
    const a=this.active;if(!a)return;
    const e={type,t:(performance.now()-a.start)/1000,...data};a.events.push(e);this.write(e);
  }
  command(action,value){
    if(!this.active)return;
    const safeValue=['stimulate','flyvis-source'].includes(action)?value:undefined;
    this.event('command',{age:this.getSample().age,action,value:safeValue});
  }
  intake(){
    const a=this.active,i=this.getIntake();
    if(!a||!i||i.time===a.intakeTime)return;
    a.intakeTime=i.time;
    this.event('intake',{age:i.time,seconds:i.seconds,x:i.x,y:i.y});
  }
  sample(){
    const a=this.active;if(!a)return;
    const start=performance.now();
    try{
      const s={type:'sample',t:(start-a.start)/1000,...this.getSample()};
      a.samples.push(s);this.write(s);
      for(const e of [...this.getEvents()].reverse())if(!a.seen.has(e)){
        a.seen.add(e);this.event('pet-event',{age:e.time,text:e.text});
      }
      this.intake();
      const cost=performance.now()-start;a.workMs+=cost;a.maxWorkMs=Math.max(a.maxWorkMs,cost);
    }catch(e){this.error=e.message;this.log('行为采样失败：'+e.message);void this.stop('sampling-error');}
  }
  stop(reason='manual-stop'){
    if(this.finishing)return this.finishing;
    const a=this.active;if(!a)return Promise.resolve(this.last);
    if(a.stopping)return Promise.resolve(this.last);
    a.stopping=true;
    clearInterval(a.interval);clearTimeout(a.timeout);
    if(reason!=='sampling-error'&&reason!=='write-backpressure'&&reason!=='write-error')this.sample();
    this.active=null;
    this.finishing=(async()=>{
      await new Promise(resolve=>{if(a.stream.destroyed)return resolve();a.stream.once('error',resolve);a.stream.end(resolve);});
      Object.assign(a.meta,{finished:true,endedAt:new Date().toISOString(),stopReason:reason,
        observer:{meanSampleWorkMs:a.workMs/Math.max(1,a.samples.length),maxSampleWorkMs:a.maxWorkMs},error:this.error});
      const report=analyze(a.samples,a.events,a.meta);
      await Promise.all([
        fs.promises.writeFile(path.join(a.directory,'summary.json'),JSON.stringify(report,null,2)),
        fs.promises.writeFile(path.join(a.directory,'report.md'),markdown(report)),
        fs.promises.writeFile(path.join(a.directory,'trajectory.svg'),trajectory(a.samples)),
        fs.promises.writeFile(path.join(a.directory,'session.json'),JSON.stringify(a.meta,null,2)),
      ]);
      this.last={...a.meta,directory:a.directory,samples:a.samples.length};
      await fs.promises.writeFile(path.join(this.root,'latest.json'),JSON.stringify(this.last,null,2));
      return this.last;
    })().catch(e=>{this.error=e.message;this.log('行为报告生成失败：'+e.message);return null;}).finally(()=>{this.finishing=null;});
    return this.finishing;
  }
  async listen(port=8789){
    if(fs.existsSync(path.join(this.root,'latest.json'))){
      try{this.last=JSON.parse(fs.readFileSync(path.join(this.root,'latest.json'),'utf8'));}catch{/* Missing old report doesn't prevent a new observation. */}
    }
    const send=(res,code,data,type='application/json; charset=utf-8')=>{
      res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
      res.end(typeof data==='string'?data:JSON.stringify(data));
    };
    this.server=http.createServer(async(req,res)=>{
      try{
        // Exact Host and Origin checks also prevent web pages from operating this local recorder.
        if(req.headers.host!==new URL(this.url).host||req.headers.origin&&req.headers.origin!==this.url)
          return send(res,403,{error:'仅允许本机同源请求'});
        if(req.method==='GET'&&req.url==='/status')return send(res,200,{...this.status(),current:this.getSample()});
        if(req.method==='GET'&&req.url==='/')return send(res,200,
          `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>FlyPet 行为观察</title><style>body{font:18px system-ui;background:#101817;color:#d6e7df;margin:50px;line-height:1.8}a{color:#88dab6}pre{white-space:pre-wrap}</style><h1>FlyPet 行为观察</h1><p>${this.active?'记录中 · '+Math.floor((performance.now()-this.active.start)/1000)+' / '+this.active.meta.durationSeconds+' 秒':'当前未记录'}</p><p>本页只观察，不控制苍蝇。30 分钟结束后自动保存报告。</p><p><a href="/status">实时 JSON</a> · <a href="/report">最近完成报告</a> · <a href="/summary">完整指标</a> · <a href="/trajectory.svg">轨迹图</a></p>`,
          'text/html; charset=utf-8');
        const files={'/report':['report.md','text/plain; charset=utf-8'],'/summary':['summary.json','application/json; charset=utf-8'],'/trajectory.svg':['trajectory.svg','image/svg+xml']};
        if(req.method==='GET'&&files[req.url]){
          if(!this.last)return send(res,404,{error:'尚无完成的报告'});
          const [file,type]=files[req.url];return send(res,200,await fs.promises.readFile(path.join(this.last.directory,file),'utf8'),type);
        }
        if(req.method==='POST'&&['/sessions','/sessions/stop'].includes(req.url)){
          if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{error:'需要 application/json'});
          let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(res,413,{error:'请求过大'});}
          let data;try{data=JSON.parse(body||'{}');}catch{return send(res,400,{error:'JSON 格式错误'});}
          if(req.url==='/sessions')return send(res,201,this.start(data.durationSeconds??1800));
          await this.stop('manual-stop');return send(res,200,this.status());
        }
        return send(res,404,{error:'未知接口'});
      }catch(e){send(res,e.status??500,{error:e.message});}
    });
    try{
      await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(port,'127.0.0.1',resolve);});
      this.url=`http://127.0.0.1:${this.server.address().port}`;
      this.server.on('error',e=>{this.error=e.message;this.log('观测端口错误：'+e.message);});
      return this.url;
    }catch(e){this.error=e.message;this.log('观测端口不可用：'+e.message);return null;}
  }
  async close(){
    await this.stop('app-exit');
    if(this.server?.listening)await new Promise(resolve=>{this.server.close(resolve);this.server.closeIdleConnections();});
  }
}
module.exports={BehaviorMonitor,samplePet};
