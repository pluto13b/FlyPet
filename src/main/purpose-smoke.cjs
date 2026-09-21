const {BrowserWindow,screen}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

module.exports=async function({pet,inspector,officialVision,sugarWindows,ROOT}){
  // A controlled visible desktop surface, owned by the independent test instance.
  const d=screen.getPrimaryDisplay(),b=d.workArea,pointer=screen.getCursorScreenPoint();
  const options=[{x:b.x+200,y:b.y+220},{x:b.x+b.width-400,y:b.y+220},
    {x:b.x+200,y:b.y+b.height-220},{x:b.x+b.width-400,y:b.y+b.height-220}];
  const origin=options.sort((a,c)=>Math.hypot(c.x-pointer.x,c.y-pointer.y)-Math.hypot(a.x-pointer.x,a.y-pointer.y))[0];
  const backdrop=new BrowserWindow({...b,frame:false,focusable:false,skipTaskbar:true,show:false,
    backgroundColor:'#181d1f',webPreferences:{sandbox:true,contextIsolation:true}});
  backdrop.setContentProtection(false);backdrop.setAlwaysOnTop(true,'floating');
  const trace=[],report={passed:false};
  try{
    pet.state.paused=true;pet.brain.suspended=true;inspector.hide();
    await backdrop.loadURL('data:text/html;charset=utf-8,<html style="background:%23181d1f"><title>FlyPet independent approach test</title></html>');
    backdrop.setBounds(b);backdrop.showInactive();backdrop.moveTop();await wait(200);
    const s=pet.state;Object.assign(s,{...origin,heading:0,mode:'rest',speed:0,turnVelocity:0,flightUntil:0,altitude:0,
      fatigue:0,hunger:1,arousal:0,stress:0,threatUntil:-1,manualGFUntil:-1,behaviorUntil:0,
      cursorEnabled:false,visionEnabled:true,visualSteeringEnabled:true,purpose:null,pendingCue:null,
      recentChecks:[],lastRegionStamp:0,cueCooldownUntil:0,nextExploreAt:s.age+1000});
    pet.peripheralIntent={active:false};pet.visualIntent={active:false};
    officialVision.source='desktop';officialVision.lastSent=0;
    const before={feedings:s.feedings,learning:officialVision.view.learning?.updates??0};
    pet.placeSugar({x:s.x+110,y:s.y});sugarWindows.sync();
    s.paused=false;pet.brain.suspended=false;
    const start=s.age;
    for(let i=0;i<160;i++){
      await wait(100);
      trace.push({time:s.age-start,x:s.x,y:s.y,mode:s.mode,purpose:s.purpose?.kind,phase:s.purpose?.phase,
        target:s.purpose?{x:s.purpose.target.x,y:s.purpose.target.y}:null,
        candidates:officialVision.view.valueView?.regions?.map(c=>({x:c.x,y:c.y,score:c.score})),
        feedings:s.feedings,learning:officialVision.view.learning?.updates??0});
      if(s.feedings>before.feedings&&(officialVision.view.learning?.updates??0)>before.learning)break;
    }
    assert.ok(trace.some(t=>t.purpose==='inspect'),'Real captured sugar must form a visual purpose');
    assert.ok(s.feedings>before.feedings,'Image-guided independent pet must contact real desktop sugar');
    assert.ok(officialVision.view.learning.updates>before.learning,'Actual desktop intake must update individual memory');
    report.passed=true;report.seconds=s.age-start;report.before=before;
    report.after={feedings:s.feedings,learning:officialVision.view.learning.updates};
    report.learning=officialVision.view.learning;report.origin=origin;
  }catch(e){report.failure=e.message;throw e;}
  finally{
    fs.writeFileSync(path.join(ROOT,'output/verification/purpose-desktop.json'),JSON.stringify({...report,trace},null,2));
    backdrop.destroy();inspector.show();await wait(350);
    if(report.passed)fs.writeFileSync(path.join(ROOT,'output/verification/purpose-inspector.png'),(await inspector.webContents.capturePage()).toPNG());
  }
  return report;
};
