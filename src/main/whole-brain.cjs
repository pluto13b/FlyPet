const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

class WholeBrainBridge {
  constructor(root, runtime, graph, log) {
    this.isWholeBrain = true; this.n = 138639; this.timeMs = 0; this.totalSpikes = 0;
    this.rates = new Float64Array(graph.neurons.length); this.lastSpikes = [];
    this.groups = { gf: graph.neurons.flatMap((n,i) => n.role === 'gf' ? [i] : []) };
    this.silenced = new Set(); this.groupValues = {}; this.pendingGF = 0; this.pendingMs = 0;
    this.busy = false; this.suspended = false; this.failed = null; this.seq = 0; this.requests = new Map();
    this.backpressured=false;this.catchups=0;this.maxBacklogMs=0;
    this.info = { status: '加载全脑', neurons: this.n, connections: 15091983, dtMs: 2 };
    this.ready = new Promise((resolve,reject) => { this.resolveReady=resolve;this.rejectReady=reject; });
    this.child = spawn(path.join(root,'.venv-brain/Scripts/python.exe'),[path.join(root,'src/brain/worker.py'),runtime], {
      cwd:root,windowsHide:true,env:{...process.env,PYTHONPYCACHEPREFIX:path.join(root,'.cache/pycache'),
        NUMBA_CACHE_DIR:path.join(root,'.cache/numba'),PYTHONUNBUFFERED:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'} });
    this.child.stderr.on('data',data=>log('brain: '+String(data).trim()));
    this.child.on('error',e=>this.fail(e));
    this.child.on('exit',(code)=>{ if(!this.stopping)this.fail(new Error(`全脑进程退出 (${code})`)); });
    this.child.stdin.on('error',e=>{ if(!this.stopping)this.fail(e); });
    createInterface({input:this.child.stdout}).on('line',line=>{
      try {
        const msg=JSON.parse(line);
        if(msg.ready){this.update(msg.view);this.resolveReady(msg);return;}
        const pending=this.requests.get(msg.id);if(!pending)return;
        this.requests.delete(msg.id);clearTimeout(pending.timer);
        msg.error?pending.reject(new Error(msg.error)):pending.resolve(msg.result);
      } catch(e){this.fail(e);}
    });
    this.readyTimer=setTimeout(()=>this.fail(new Error('全脑加载超时')),45000);
    this.ready.then(()=>clearTimeout(this.readyTimer),()=>clearTimeout(this.readyTimer));
  }
  fail(error) {
    if(this.failed)return;this.failed=error.message;this.info.status=this.failed;
    this.rejectReady(error);
    for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(error);}this.requests.clear();
  }
  request(command,data={}) {
    if(this.failed)return Promise.reject(new Error(this.failed));
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.requests.delete(id);reject(new Error(`全脑请求超时：${command}`));},10000);
      this.requests.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,command,...data})+'\n');
    });
  }
  update(view) {
    this.timeMs=view.timeMs;this.totalSpikes=view.totalSpikes;this.groupValues=view.rates;
    this.rates.set(view.probeRates);this.pendingGF+=view.gfSpikes;
    this.lastSpikes=view.probeRates.flatMap((r,i)=>r>8?[i]:[]);
    this.silenced=new Set(view.gfSilenced?this.groups.gf:[]);
    if(this.pendingMs<=100)this.backpressured=false;
    this.info={...view,status:this.backpressured?'追赶计算，暂缓运动':'全脑在线',lagMs:this.pendingMs,
      backpressured:this.backpressured,catchups:this.catchups,maxBacklogMs:this.maxBacklogMs};delete this.info.probeRates;delete this.info.rates;
  }
  step(ms,inputs) {
    if(this.backpressured){this.pump();return {gfSpikes:0,rates:this.groupValues,spikes:[]};}
    this.pendingMs+=ms;this.inputs=inputs;
    this.pump();
    this.info.lagMs=this.pendingMs;
    this.maxBacklogMs=Math.max(this.maxBacklogMs,this.pendingMs);
    if(this.pendingMs>250){
      this.backpressured=true;this.catchups++;
      Object.assign(this.info,{status:'追赶计算，暂缓运动',backpressured:true,lagMs:this.pendingMs,catchups:this.catchups,maxBacklogMs:this.maxBacklogMs});
    }
    const gfSpikes=this.pendingGF;this.pendingGF=0;
    return {gfSpikes,rates:this.groupValues,spikes:this.lastSpikes};
  }
  pump() {
    if(!this.busy&&!this.suspended&&this.pendingMs>=50&&!this.failed){
      this.pendingMs-=50;this.busy=true;
      this.inflight=this.request('step',{ms:50,inputs:this.inputs,vision:this.vision??[]})
        .then(view=>this.update(view)).catch(e=>this.fail(e)).finally(()=>{this.busy=false;this.pump();});
    }
  }
  groupRates(){return this.groupValues;}
  stimulate(group){this.request('stimulate',{group}).catch(e=>this.fail(e));return true;}
  silence(_group,enabled=true){
    this.silenced=new Set(enabled?this.groups.gf:[]);
    return this.request('silence',{enabled}).catch(e=>this.fail(e));
  }
  snapshot(){return {kind:'whole-brain',timeMs:this.timeMs,pendingMs:this.pendingMs,pendingGF:this.pendingGF};}
  restore(saved){if(saved?.kind==='whole-brain'){this.pendingMs=0;this.pendingGF=saved.pendingGF??0;this.backpressured=false;}}
  async checkpoint(pet){return this.request('save',{pet});}
  async close(){
    this.stopping=true;this.suspended=true;clearTimeout(this.readyTimer);
    if(this.child.exitCode!==null)return;
    await new Promise(resolve=>{
      const timeout=setTimeout(()=>{this.child.kill();resolve();},3000);
      this.child.once('exit',()=>{clearTimeout(timeout);resolve();});
      this.child.stdin.end(JSON.stringify({id:++this.seq,command:'quit'})+'\n');
    });
  }
}
module.exports={WholeBrainBridge};
