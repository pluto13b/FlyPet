const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const path=require('node:path');

class OfficialVision {
  constructor(root,{petId=null,learning=null}={}){
    this.ready=false;this.busy=false;this.stopping=false;this.source='desktop';this.lastSent=0;
    this.petId=petId;this.learningSnapshot=learning;this.requests=new Map();this.nextId=1;
    this.view={status:'加载官方 flyvis…',retina:[],responses:{},frames:0,controlsBody:false};
    this.child=spawn(path.join(root,'.venv-vision/Scripts/python.exe'),['-u',path.join(root,'src/vision/worker.py')],{
      cwd:root,windowsHide:true,env:{...process.env,PYTHONPYCACHEPREFIX:path.join(root,'.cache/pycache'),
        NUMBA_CACHE_DIR:path.join(root,'.cache/numba-vision'),MPLCONFIGDIR:path.join(root,'.cache/matplotlib'),
        FLYVIS_ROOT_DIR:path.join(root,'data/flyvis'),TORCH_HOME:path.join(root,'.cache/torch'),
        CUDA_CACHE_PATH:path.join(root,'.cache/cuda'),OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'4'}});
    this.stderr='';this.child.stderr.on('data',s=>{this.stderr=(this.stderr+String(s)).slice(-4000);});
    this.child.on('error',e=>{this.view.status='官方视觉不可用：'+e.message;});
    this.child.on('exit',()=>{for(const q of this.requests.values()){clearTimeout(q.timer);q.reject(new Error('视觉进程退出'));}this.requests.clear();if(!this.stopping){this.ready=false;this.view.status='官方视觉进程退出';}});
    this.child.stdin.on('error',e=>{if(!this.stopping)this.view.status=e.message;});
    createInterface({input:this.child.stdout}).on('line',line=>{
      try{const msg=JSON.parse(line);
        if(msg.id){const q=this.requests.get(msg.id);if(q){clearTimeout(q.timer);this.requests.delete(msg.id);msg.error?q.reject(new Error(msg.error)):q.resolve(msg.result);}return;}
        if(msg.ready){
          this.view.status=msg.status;
          this.request('restore',{petId,snapshot:learning}).then(result=>{this.view.learning=result;this.ready=true;}).catch(e=>{this.view.status=e.message;});
        }
        if(msg.result){this.view=msg.result;this.busy=false;}
        if(msg.error){this.view.status=msg.error;this.view.valueView=null;this.view.peripheralView=null;this.busy=false;}
      }catch{this.view.status='官方视觉返回格式异常';this.busy=false;}
    });
  }
  request(command,data={}){
    if(this.stopping||this.child.exitCode!==null)return Promise.reject(new Error('视觉进程未运行'));
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.requests.delete(id);reject(new Error('视觉命令超时：'+command));},10000);
      this.requests.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,command,...data})+'\n');
    });
  }
  async checkpoint(){
    if(!this.ready)return this.learningSnapshot;
    this.learningSnapshot=await this.request('checkpoint');return this.learningSnapshot;
  }
  async reward(cue,key){
    const result=await this.request('reward',{petId:this.petId,token:cue.token,key});
    if(result.updated)this.view.learning={...this.view.learning,...result,lastResult:result};
    return result;
  }
  observe(rect,view,preview=true){
    if(!this.ready||this.busy||this.stopping)return;
    const now=performance.now(),elapsedMs=this.lastSent?Math.min(200,now-this.lastSent):40;this.lastSent=now;
    this.busy=true;this.child.stdin.write(JSON.stringify({command:'observe',rect,view,preview,source:this.source,elapsedMs,sentAt:Date.now()})+'\n');
  }
  async close(){
    this.stopping=true;
    if(this.child.exitCode!==null)return;
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{this.child.kill();resolve();},5000);
      this.child.once('exit',()=>{clearTimeout(timer);resolve();});
      this.child.stdin.end(JSON.stringify({command:'quit'})+'\n');
    });
  }
}
module.exports={OfficialVision};
