const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function smoke({ pet, inspector, overlay, metrics, errors, save, saveFile, ROOT, officialVision,sugarWindows,monitor }) {
  const out = path.join(ROOT, 'output', 'verification'); fs.mkdirSync(out, { recursive: true });
  const previous = fs.existsSync(path.join(out,'desktop-smoke.json'))
    ? JSON.parse(fs.readFileSync(path.join(out,'desktop-smoke.json'),'utf8')) : null;
  const report = { date: new Date().toISOString(), id: pet.state.id, initialBrainMs:pet.brain.timeMs, checks: {}, errors, metrics: {} };
    const savedBrainTime=fs.existsSync(saveFile)?JSON.parse(fs.readFileSync(saveFile,'utf8')).brain?.timeMs:0;
  try {
    inspector.show();inspector.restore();
    await wait(2500);
    for(let i=0;i<120 && (officialVision.view.frames<3||!officialVision.view.spatialResponses);i++)await wait(500);
    assert.ok(officialVision.view.frames>=3,officialVision.view.status+' '+officialVision.stderr);
    assert.equal(officialVision.view.columns,721);
    assert.equal(officialVision.view.neurons,45669);
    report.checks.officialPretrainedDesktopVision=true;
    const monitorStatus=await (await fetch(monitor.url+'/status')).json();
    assert.equal(monitorStatus.current.id,pet.state.id);
    const monitorStart=await fetch(monitor.url+'/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({durationSeconds:600})});
    assert.equal(monitorStart.status,201);
    report.checks.observerEndpoint=true;
    assert.equal(Object.keys(officialVision.view.spatialResponses).length,8);
    for(const values of Object.values(officialVision.view.spatialResponses))assert.equal(values.length,721);
    assert.equal(officialVision.view.valueView?.scores.length,3,officialVision.view.valueError);
    assert.ok(officialVision.view.egoMotion);
    report.checks.spatialMotionAndLocalValue=true;
    assert.equal(officialVision.view.peripheralView?.sectors.length,8);
    assert.equal(officialVision.view.peripheralView.radius,480);
    report.checks.peripheralView=true;
    report.officialVision={...officialVision.view};for(const k of ['retina','spatialResponses','scenePreview','previewRetina'])delete report.officialVision[k];
    const {screen}=require('electron');
    const oldPosition=structuredClone(Object.fromEntries(['x','y','heading','cursorEnabled','visualSteeringEnabled','mode','speed','altitude','flightUntil','threatUntil','manualGFUntil','behaviorUntil','purpose','nextExploreAt','cueCooldownUntil'].map(k=>[k,pet.state[k]])));
    const pointer=screen.getCursorScreenPoint();
    Object.assign(pet.state,{x:pointer.x-80,y:pointer.y,heading:0,cursorEnabled:false,visualSteeringEnabled:false,
      mode:'rest',speed:0,altitude:0,flightUntil:0,threatUntil:-1,manualGFUntil:-1,behaviorUntil:pet.state.age+4,
      purpose:null,nextExploreAt:pet.state.age+100,cueCooldownUntil:pet.state.age+100});
    const cursorFrameStart=officialVision.view.frames;
    for(let i=0;i<30;i++){
      await wait(100);
      if(officialVision.view.frames>cursorFrameStart&&officialVision.view.cursorColumn!==null&&officialVision.view.cursorColumn!==undefined)break;
      const currentPointer=screen.getCursorScreenPoint();
      Object.assign(pet.state,{x:currentPointer.x-80,y:currentPointer.y,heading:0});
    }
    report.cursorCapture={pointer:screen.getCursorScreenPoint(),pet:{x:pet.state.x,y:pet.state.y,heading:pet.state.heading},input:officialVision.view.inputInfo,status:officialVision.view.status,frames:officialVision.view.frames};
    assert.equal(officialVision.view.cursorInFrame,true);
    assert.ok(Number.isInteger(officialVision.view.cursorColumn));
    report.checks.cursorReachesOfficialRetina=true;
    Object.assign(pet.state,oldPosition);
    assert.equal(inspector.webContents.isLoading(), false);
    assert.equal(overlay.webContents.isLoading(), false);
    report.checks.windowsLoaded = true;
    // Native Windows screen capture must see the console (not just Electron capturePage).
    const oldHeader=await inspector.webContents.executeJavaScript(`(()=>{const h=document.querySelector('header');const old=h.style.backgroundColor;h.style.backgroundColor='#e125d9';return old;})()`);
    const captureWork=screen.getPrimaryDisplay().workArea;
    inspector.setPosition(captureWork.x+10,captureWork.y+10);
    inspector.setAlwaysOnTop(true,'screen-saver');
    inspector.show();inspector.moveTop();inspector.focus();await wait(600);
    const contentBounds=inspector.getContentBounds();
    const shotPoint=screen.dipToScreenPoint({x:Math.round(contentBounds.x+contentBounds.width/2),y:contentBounds.y+30});
    const consolePixel=await pet.brain.request('capture-point',{point:shotPoint});
    await inspector.webContents.executeJavaScript(`document.querySelector('header').style.backgroundColor='#25e1d9'`);
    await wait(300);
    const secondConsolePixel=await pet.brain.request('capture-point',{point:shotPoint});
    await inspector.webContents.executeJavaScript(`document.querySelector('header').style.backgroundColor=${JSON.stringify(oldHeader)}`);
    inspector.setAlwaysOnTop(false);
    report.consoleCaptureGeometry={contentBounds,shotPoint,colors:[consolePixel.rgb,secondConsolePixel.rgb]};
    // Windows color management can scale the RGB levels; verify two distinct colors,
    // not exact sRGB bytes or a coincidental pixel from the window underneath.
    assert.ok(consolePixel.rgb[0]>150&&consolePixel.rgb[1]<80&&consolePixel.rgb[2]>150,`Console excluded from native capture: ${consolePixel.rgb}`);
    assert.ok(secondConsolePixel.rgb[0]<80&&secondConsolePixel.rgb[1]>150&&secondConsolePixel.rgb[2]>150,`Console capture did not follow UI: ${secondConsolePixel.rgb}`);
    report.consoleCaptureColors=[consolePixel.rgb,secondConsolePixel.rgb];
    report.checks.consoleNativeScreenshot=true;
    report.overlayBounds = overlay.getBounds();
    fs.writeFileSync(path.join(out,'initial.png'), (await inspector.webContents.capturePage()).toPNG());
    const layout = await inspector.webContents.executeJavaScript(`(() => ({
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight, text: document.body.innerText,
      panels: [...document.querySelectorAll('.panel')].map(el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })
    }))()`);
    assert.ok(layout.text.includes('FlyPet') && layout.text.includes('138,639'));
    assert.equal(pet.brain.n,138639);assert.equal(pet.brain.info.connections,15091983);
    assert.ok(pet.brain.timeMs>0);assert.ok(pet.brain.info.visionFrames>0);
    report.checks.fullBrainRunningWithScreenInput=true;
    assert.ok(layout.scrollWidth <= layout.width);
    assert.ok(layout.scrollHeight <= layout.height, `Window overflow ${layout.scrollHeight}/${layout.height}`);
    report.layout = layout;
    report.checks.layoutFits = true;
    for(let i=0;i<30;i++){
      if(await inspector.webContents.executeJavaScript(`document.getElementById('capture-preview').naturalWidth>0`))break;
      await wait(100);
    }
    assert.ok(await inspector.webContents.executeJavaScript(`document.getElementById('capture-preview').naturalWidth>0`));
    await inspector.webContents.executeJavaScript(`document.getElementById('vision-layer').value='activity';document.getElementById('vision-layer').dispatchEvent(new Event('change'))`);
    await wait(100);
    assert.ok(await inspector.webContents.executeJavaScript(`document.getElementById('official-motion').clientWidth>0`));
    await inspector.webContents.executeJavaScript(`document.getElementById('vision-layer').value='input';document.getElementById('vision-layer').dispatchEvent(new Event('change'))`);
    assert.equal(pet.state.ignoreInspector,false);
    await inspector.webContents.executeJavaScript(`document.getElementById('ignore-inspector').click()`);await wait(100);
    assert.equal(pet.state.ignoreInspector,true);
    await inspector.webContents.executeJavaScript(`document.getElementById('ignore-inspector').click()`);await wait(100);
    assert.equal(pet.state.ignoreInspector,false);
    report.checks.captureComparisonAndMaskToggle=true;
    assert.equal(await inspector.webContents.executeJavaScript(`document.getElementById('official-motion').dataset.columns`),'721');
    await inspector.webContents.executeJavaScript(`document.getElementById('visual-steering').click()`);await wait(80);
    assert.equal(pet.state.visualSteeringEnabled,false);
    await inspector.webContents.executeJavaScript(`document.getElementById('visual-steering').click()`);await wait(80);
    assert.equal(pet.state.visualSteeringEnabled,true);
    report.checks.visualSteeringToggle=true;
    const cloud=await inspector.webContents.executeJavaScript(`({...document.getElementById('network').dataset})`);
    assert.equal(cloud.points,'139255');assert.equal(cloud.renderer,'three-webgl');assert.equal(cloud.rendered,'true');
    report.checks.denseAnatomyRendered=true;
    const sizes=await inspector.webContents.executeJavaScript(`(() => Object.fromEntries(['network','official-retina'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{width:r.width,height:r.height}];})))()`);
    for(const [panel,canvas] of [['brain','network'],['vision','official-retina']]){
      await inspector.webContents.executeJavaScript(`document.querySelector('[data-expand="${panel}"]').click()`);
      await wait(150);
      const expanded=await inspector.webContents.executeJavaScript(`(()=>{const r=document.getElementById('${canvas}').getBoundingClientRect();return {height:r.height,width:r.width,focus:document.body.dataset.focus};})()`);
      assert.equal(expanded.focus,panel);assert.ok(expanded.height>sizes[canvas].height);
      if(panel==='brain'){
        const rect=await inspector.webContents.executeJavaScript(`(()=>{const r=document.getElementById('network').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
        inspector.webContents.sendInputEvent({type:'mouseDown',...rect,button:'left',clickCount:1});
        inspector.webContents.sendInputEvent({type:'mouseMove',x:rect.x+150,y:rect.y+25,button:'left'});
        inspector.webContents.sendInputEvent({type:'mouseUp',x:rect.x+150,y:rect.y+25,button:'left',clickCount:1});
        await wait(250);
        const rotated=await inspector.webContents.executeJavaScript(`Number(document.getElementById('network').dataset.azimuth)`);
        assert.ok(Math.abs(rotated)>.05);
        inspector.webContents.sendInputEvent({type:'mouseWheel',...rect,deltaY:150,deltaX:0});
        await wait(200);
        const zoomed=await inspector.webContents.executeJavaScript(`Number(document.getElementById('network').dataset.zoom)`);
        assert.notEqual(zoomed,1);
        await inspector.webContents.executeJavaScript(`document.getElementById('brain-activity').click();document.getElementById('brain-reset').click()`);
        assert.equal(await inspector.webContents.executeJavaScript(`document.getElementById('network').dataset.activity`),'false');
        await wait(200);
        await inspector.webContents.executeJavaScript(`document.getElementById('brain-activity').click()`);
        report.checks.brainRotateZoomAndLayers=true;
      }
      fs.writeFileSync(path.join(out,`${panel}-expanded.png`),(await inspector.webContents.capturePage()).toPNG());
      await inspector.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    }
    report.panelSizes=sizes;report.checks.expandAndEscape=true;
    const inputChecks=[];
    for(const source of ['right','left','scroll','desktop']){
      await inspector.webContents.executeJavaScript(`(()=>{const e=document.getElementById('flyvis-source');e.value='${source}';e.dispatchEvent(new Event('change'));})()`);
      for(let i=0;i<60&&officialVision.view.source!==source;i++)await wait(100);
      assert.equal(officialVision.view.source,source);
      await wait(500);
      inputChecks.push({source,frames:officialVision.view.frames,responses:{...officialVision.view.responses},wallMs:officialVision.view.wallMs});
    }
    report.checks.officialInputControls=true;
    fs.writeFileSync(path.join(ROOT,'output/flyvis/live-input-checks.json'),JSON.stringify(inputChecks,null,2));
    assert.ok(metrics.captures > 0, pet.vision.status);
    assert.equal(pet.vision.eyes.left.length, 63); report.checks.liveScreenCapture = true;
    await inspector.webContents.executeJavaScript(`document.getElementById('cursor').click()`);
    await wait(80);
    assert.equal(pet.state.cursorEnabled, false);
    await inspector.webContents.executeJavaScript(`document.getElementById('vision').click()`);
    await wait(80);
    assert.equal(pet.state.visionEnabled, false);
    await inspector.webContents.executeJavaScript(`document.getElementById('pause').click()`);
    await wait(80);
    const age = pet.state.age, brainTime = pet.brain.timeMs;
    await wait(400);
    assert.equal(pet.state.age, age); assert.equal(pet.brain.timeMs, brainTime);
    report.checks.pauseFreezesCore = true;
    await inspector.webContents.executeJavaScript(`document.getElementById('pause').click()`);
    await pet.brain.silence('gf',true);
    await wait(2200);
    // Placement events target only our own windows; never click another application.
    pet.state.paused=true;pet.brain.suspended=true;
    await wait(100);
    const hungerBeforePlacement=pet.state.hunger;
    report.sugarDisplays=[];
    for(const display of screen.getAllDisplays()){
      await inspector.webContents.executeJavaScript(`document.getElementById('feed').click()`);
      for(let i=0;i<50&&(!sugarWindows.placing||sugarWindows.placements.some(w=>!w.isVisible()));i++)await wait(100);
      assert.equal(sugarWindows.placements.length,screen.getAllDisplays().length);
      const selection=sugarWindows.placements.find(w=>w.getBounds().x===display.bounds.x&&w.getBounds().y===display.bounds.y);
      assert.ok(selection);
      const local={x:Math.round(display.bounds.width*.5),y:Math.round(display.bounds.height*.5)};
      selection.webContents.sendInputEvent({type:'mouseDown',...local,button:'left',clickCount:1});
      selection.webContents.sendInputEvent({type:'mouseUp',...local,button:'left',clickCount:1});
      for(let i=0;i<30&&sugarWindows.placing;i++)await wait(50);
      assert.equal(sugarWindows.placing,false);assert.ok(pet.state.sugar);
      assert.equal(pet.state.sugar.x,display.bounds.x+local.x);
      assert.equal(pet.state.sugar.y,display.bounds.y+local.y);
      assert.equal(pet.state.hunger,hungerBeforePlacement);
      await wait(200);
      const point=screen.dipToScreenPoint({x:Math.round(pet.state.sugar.x),y:Math.round(pet.state.sugar.y)});
      const {rgb}=await pet.brain.request('capture-point',{point});
      assert.ok(Math.abs(rgb[0]-40)<12&&Math.abs(rgb[1]-216)<12&&Math.abs(rgb[2]-189)<12,`Sugar not captured at ${JSON.stringify(point)}: ${rgb}`);
      report.sugarDisplays.push({display:display.id,scaleFactor:display.scaleFactor,position:{...pet.state.sugar},rgb});
    }
    report.checks.sugarPlacementAndCapture=true;
    const beforeCancel={...pet.state.sugar};
    await inspector.webContents.executeJavaScript(`document.getElementById('feed').click()`);
    for(let i=0;i<50&&(!sugarWindows.placing||sugarWindows.placements.some(w=>!w.isVisible()));i++)await wait(100);
    sugarWindows.placements[0].webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    for(let i=0;i<30&&sugarWindows.placing;i++)await wait(50);
    assert.equal(sugarWindows.placing,false);assert.deepEqual(pet.state.sugar,beforeCancel);
    report.checks.escapeCancelsPlacement=true;
    await inspector.webContents.executeJavaScript(`document.getElementById('sugar-remove').click()`);
    await wait(100);assert.equal(pet.state.sugar,null);assert.equal(sugarWindows.drop.isVisible(),false);
    pet.state.hunger=.9;
    pet.state.x=beforeCancel.x;pet.state.y=beforeCancel.y;pet.state.speed=0;pet.state.altitude=0;pet.state.flightUntil=0;
    pet.placeSugar({x:pet.state.x,y:pet.state.y});sugarWindows.sync();
    pet.state.paused=false;pet.brain.suspended=false;
    await wait(500);
    assert.ok(pet.state.hunger<.88);assert.equal(pet.state.mode,'feeding');
    assert.equal(pet.state.caption,'吃。');report.checks.sugarFeedingReducesHunger=true;
    fs.writeFileSync(path.join(out,'sugar.png'),(await sugarWindows.drop.webContents.capturePage()).toPNG());
    await pet.brain.silence('gf',false);
    const escapes = pet.state.escapes;
    await inspector.webContents.executeJavaScript(`document.querySelector('[data-stim="gf"]').click()`);
    for(let i=0;i<20&&pet.state.escapes===escapes;i++)await wait(50);
    assert.ok(pet.state.escapes > escapes); assert.equal(pet.state.caption,'跑！');
    report.checks.GFButtonCausesEscape = true;
    fs.writeFileSync(path.join(out,'motion-takeoff.png'), (await overlay.webContents.capturePage()).toPNG());
    await wait(300);
    fs.writeFileSync(path.join(out,'motion-flight.png'), (await overlay.webContents.capturePage()).toPNG());
    await wait(500);
    fs.writeFileSync(path.join(out,'motion-landing.png'), (await overlay.webContents.capturePage()).toPNG());
    await wait(450);
    fs.writeFileSync(path.join(out,'motion-grounded.png'), (await overlay.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out,'inspector.png'), (await inspector.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out,'body.png'), (await overlay.webContents.capturePage()).toPNG());
    await inspector.webContents.executeJavaScript(`document.getElementById('silence').click()`);
    await wait(1800);
    const before = pet.state.escapes;
    await inspector.webContents.executeJavaScript(`document.querySelector('[data-stim="lc4"]').click()`);
    await wait(350);
    assert.equal(pet.state.escapes, before); report.checks.silencingPreventsEscape = true;
    await inspector.webContents.executeJavaScript(`document.getElementById('silence').click(); document.getElementById('cursor').click(); document.getElementById('vision').click(); document.getElementById('save').click()`);
    await wait(150);
    const soakStart=performance.now(),brainStart=pet.brain.timeMs;
    let maxBacklog=0;
    for(let i=0;i<300;i++){
      await wait(100);maxBacklog=Math.max(maxBacklog,pet.brain.pendingMs);
      assert.equal(pet.brain.failed,null);assert.equal(pet.state.paused,false);
    }
    const soakWall=performance.now()-soakStart;
    report.officialVisionFinal={...officialVision.view};for(const k of ['retina','spatialResponses','scenePreview','previewRetina'])delete report.officialVisionFinal[k];
    report.soak={wallMs:soakWall,simulatedMs:pet.brain.timeMs-brainStart,maxBacklogMs:maxBacklog};
    assert.ok(report.soak.simulatedMs>soakWall*.85);
    assert.ok(pet.brain.pendingMs<250);
    report.checks.sustainedFullBrainScheduling=true;
    if(process.env.FLYPET_PERF==='1'){
      const label=process.env.FLYPET_REFERENCE_VISION==='1'?'app-reference':'app-optimized';
      const {execFile}=require('node:child_process');
      await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'scripts/measure-performance.ps1'),'-Label',label,'-Seconds','20','-MainPid',String(process.pid),'-Url',monitor.url],{cwd:ROOT,windowsHide:true},(err,stdout,stderr)=>err?reject(new Error(stderr||err.message)):resolve(stdout)));
      report.performance=JSON.parse(fs.readFileSync(path.join(ROOT,'output/performance',label+'.json'),'utf8').replace(/^\uFEFF/,''));
    }
    inspector.hide();await wait(250);
    const drawCounts=()=>inspector.webContents.executeJavaScript(`['portrait','network'].map(id=>document.getElementById(id).dataset.frames)`);
    const hiddenDraws=await drawCounts(),hiddenFrames=officialVision.view.frames;
    await wait(600);
    assert.deepEqual(await drawCounts(),hiddenDraws);
    assert.ok(officialVision.view.frames>hiddenFrames,'hidden console must not stop vision');
    assert.equal(officialVision.view.scenePreview,null);
    inspector.show();await wait(350);
    report.checks.hiddenConsoleStopsDrawingButNotPerception=true;
    report.purpose=await require('./purpose-smoke.cjs')({pet,inspector,officialVision,sugarWindows,ROOT});
    report.checks.realScreenApproachIntakeAndLearning=true;
    pet.placeSugar({x:pet.bounds.x+100,y:pet.bounds.y+100});
    await save();
    const stored=JSON.parse(fs.readFileSync(saveFile,'utf8')).state;
    const learned=JSON.parse(fs.readFileSync(saveFile,'utf8')).visualLearning;
    assert.equal(learned.petId,pet.state.id);assert.ok(learned.memory.updates>0);
    assert.deepEqual(stored.purpose,pet.state.purpose);
    report.checks.individualLearningSavedWithBrain=true;
    const savedVision=JSON.parse(fs.readFileSync(saveFile,'utf8')).officialVision;
    assert.equal(savedVision.scenePreview,undefined);assert.equal(savedVision.previewRetina,undefined);
    assert.deepEqual(stored.sugar,pet.state.sugar);assert.equal(stored.exploreRng,pet.state.exploreRng);
    report.checks.lifeStateSaved=true;
    assert.ok(fs.existsSync(path.join(path.dirname(saveFile),'full-brain.npz')));
    report.brain={...pet.brain.info};
    assert.equal(JSON.parse(fs.readFileSync(saveFile,'utf8')).state.id, pet.state.id);
    report.checks.savedSameIdentity = true;
    if (previous?.id) { assert.equal(previous.id,pet.state.id); report.checks.relaunchRestoredIdentity = true; }
    if(savedBrainTime){assert.ok(report.initialBrainMs>=savedBrainTime);report.checks.relaunchRestoredBrainTime=true;report.restoredFromCheckpointMs=savedBrainTime;}
    report.metrics = { ...metrics, memory: process.memoryUsage() };
    // Stopping from the console must produce the same report as the background API.
    await inspector.webContents.executeJavaScript(`document.getElementById('monitor-toggle').click()`);
    for(let i=0;i<30&&(monitor.active||monitor.finishing);i++)await wait(100);
    assert.equal(monitor.active,null);assert.ok(monitor.last);
    const observation=JSON.parse(fs.readFileSync(path.join(monitor.last.directory,'summary.json'),'utf8'));
    assert.equal(observation.session.petId,pet.state.id);assert.ok(observation.samples>100);
    assert.ok(observation.sugar.intakeSeconds>0);
    assert.ok(observation.commands.stimulate>=1);
    assert.equal(observation.session.stopReason,'manual-stop');
    report.behaviorMonitor={directory:monitor.last.directory,samples:observation.samples,intakeSeconds:observation.sugar.intakeSeconds,observer:observation.session.observer};
    report.checks.observerRecordedWithoutScreenshots=true;
    assert.equal(errors.length,0, errors.join('\n'));
    report.passed = true;
  } catch (error) { report.passed = false; report.failure = error.stack; throw error; }
  finally { report.finalBrain={...pet.brain.info};report.finalState={...pet.state};fs.writeFileSync(path.join(out,'desktop-smoke.json'), JSON.stringify(report,null,2)); }
};
