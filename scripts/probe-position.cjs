const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {pixel}=require('../src/main/coordinates.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.runtime','position-probe');
for(const key of ['userData','sessionData','logs','crashDumps']){const dir=path.join(base,key);fs.mkdirSync(dir,{recursive:true});app.setPath(key,dir);}
app.whenReady().then(()=>{
  const win=new BrowserWindow({show:false,width:240,height:180});
  const results=[];
  for(const [label,y] of [['zero',0],['negative-zero',-0],['rounded-negative-fraction',Math.round(-0.2)],['negative-integer',-1],['positive-integer',90],['NaN',NaN]]){
    try{win.setPosition(100,y,false);results.push({label,accepted:true});}
    catch(e){results.push({label,accepted:false,error:e.message});}
  }
  for(const [x,y] of [[-0,100],[100,-0],[-0,-0],[-0.2,-0.2],[-1920.3,-0.2]]){
    try{win.setPosition(pixel(x),pixel(y),false);results.push({label:'normalized-coordinates',x,y,accepted:true});}
    catch(e){results.push({label:'normalized-coordinates',x,y,accepted:false,error:e.message});process.exitCode=1;}
  }
  fs.writeFileSync(path.join(root,'output','verification','position-probe.json'),JSON.stringify(results,null,2));
  app.quit();
});
