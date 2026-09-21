const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { pixel } = require('./coordinates.cjs');
const { WholeBrainBridge } = require('./whole-brain.cjs');
const { OfficialVision } = require('./official-vision.cjs');
const { SugarWindows } = require('./sugar.cjs');
const { BehaviorMonitor, samplePet } = require('./behavior-monitor.cjs');
const ROOT = path.resolve(__dirname, '../..');
const smoke = process.argv.includes('--smoke');
const runtime = path.join(ROOT, '.runtime', smoke ? 'smoke' : 'pet');
for (const name of ['userData', 'session', 'logs', 'crashes']) fs.mkdirSync(path.join(runtime, name), { recursive: true });
for (const [name, folder] of [['userData','userData'], ['sessionData','session'], ['logs','logs'], ['crashDumps','crashes']])
  app.setPath(name, path.join(runtime, folder));
app.commandLine.appendSwitch('disk-cache-dir', path.join(runtime, 'session', 'cache'));
app.commandLine.appendSwitch('disable-http-cache');
app.setName('FlyPet');
const saveFile = path.join(runtime, 'pet.json');
let pet, overlay, inspector, tray, timer, captureTimer, graph;
let closing = false, captureBusy = false, lastCapturePosition = null;
let saving = false, saveTask = null, brain, officialVision, officialTimer;
let locateUntil = 0;
let sugarWindows;
let monitor;
let lastInspectorPublish=0;
let overlayPosition=null,lastOverlayKey='';
let lastLearningMeal=-1;
const errors = [];
const metrics = { tickMs: 0, captures: 0, captureMs: 0, startedAt: Date.now() };
const log = message => {
  errors.push(String(message));
  fs.appendFileSync(path.join(runtime, 'logs', 'app.log'), `${new Date().toISOString()} ${message}\n`);
};

function save() {
  if (!pet) return;
  if(saveTask)return saveTask;
  saving=true;brain.suspended=true;
  saveTask=(async()=>{
    if(brain.inflight)await brain.inflight;
    const snapshot=pet.snapshot();
    snapshot.visualLearning=await officialVision.checkpoint();
    snapshot.officialVision={...officialVision?.view};delete snapshot.officialVision.retina;
    delete snapshot.officialVision.spatialResponses;
    delete snapshot.officialVision.scenePreview;
    delete snapshot.officialVision.previewRetina;
    await brain.checkpoint(snapshot);
    const tmp = saveFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, saveFile);
  })().finally(()=>{saving=false;brain.suspended=pet.state.paused;saveTask=null;});
  return saveTask;
}

function publish() {
  if(!pet)return;
  sugarWindows?.sync();
  // The moving sprite needs every update; large diagnostic images do not.
  const s=pet.state,locating=Date.now()<locateUntil;
  const key=[s.age,s.x,s.y,s.heading,s.paused,s.mode,s.caption,s.showCaption,locating].join('|');
  if(overlay&&!overlay.isDestroyed()&&key!==lastOverlayKey){
    overlay.webContents.send('view',{state:s,locating});lastOverlayKey=key;
  }
  const now=performance.now();
  if(!inspector||inspector.isDestroyed()||!inspector.isVisible()||inspector.isMinimized()||now-lastInspectorPublish<65)return;
  lastInspectorPublish=now;
  const view = { ...pet.view(), monitor:monitor?.status(), placingSugar: sugarWindows?.placing??false, locating: Date.now() < locateUntil, metrics: { ...metrics }, saveFile, officialVision:officialVision?.view };
  inspector.webContents.send('view', view);
}

function makeWindow(options, file, protect=true) {
  const win = new BrowserWindow({ ...options, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
    nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } });
  win.webContents.on('render-process-gone', (_e, details) => log(JSON.stringify(details)));
  win.webContents.on('console-message', (_e, details) => { if (details.level === 'error') log(details.message); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(ROOT, 'src/renderer', file));
  win.setContentProtection(protect); // Console/food opt out; sensory masking excludes the console separately.
  return win;
}

function sensoryMask() {
  const excludeRects=pet?.state.ignoreInspector&&inspector&&!inspector.isDestroyed()&&inspector.isVisible()&&!inspector.isMinimized()
    ? [screen.dipToScreenRect(inspector,inspector.getBounds())] : [];
  const f=pet?.state.sugar;
  let foodPixels=null;
  if(f&&sugarWindows?.drop.isVisible()){
    const center=screen.dipToScreenPoint({x:pixel(f.x),y:pixel(f.y)});
    const scale=screen.getDisplayNearestPoint({x:pixel(f.x),y:pixel(f.y)}).scaleFactor;
    foodPixels={...center,radius:f.radius*scale};
  }
  return {excludeRects,foodPixels};
}

function showInspector() {
  inspector.show(); inspector.focus();
}

function locateFly() {
  if (!pet || !overlay || overlay.isDestroyed()) return;
  const d=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  pet.state.x=d.x+d.width/2;pet.state.y=d.y+d.height/2;
  locateUntil=Date.now()+12000;
  overlay.setPosition(pixel(pet.state.x-120),pixel(pet.state.y-90));
  overlay.setAlwaysOnTop(true,'screen-saver');
  overlay.showInactive();overlay.moveTop();publish();
}

async function capture() {
  if (captureBusy || !pet || pet.state.paused || brain.backpressured || !pet.state.visionEnabled) return;
  captureBusy = true;
  const start = performance.now();
  try {
    const display = screen.getDisplayNearestPoint({ x: pixel(pet.state.x), y: pixel(pet.state.y) });
    const moved = !lastCapturePosition || Math.hypot(pet.state.x - lastCapturePosition.x, pet.state.y - lastCapturePosition.y) > 12;
    const sampled = await brain.request('capture',{physical:screen.dipToScreenRect(null,display.bounds),
      bounds:display.bounds,fly:{x:pet.state.x,y:pet.state.y,heading:pet.state.heading},
      previous:moved?[]:pet.vision.values??[],...sensoryMask()});
    if (!pet.state.paused && pet.state.visionEnabled) {
      pet.vision = { ...sampled, status: '实时屏幕 · 126 采样点', capturedAt: Date.now(), displayId: display.id };
      lastCapturePosition = { x: pet.state.x, y: pet.state.y };
      metrics.captures++; metrics.captureMs = performance.now() - start;
    }
  } catch (error) { pet.vision = { ...pet.vision, status: `采样不可用：${error.message}`, change: 0, capturedAt: 0 }; }
  finally { captureBusy = false; }
}

async function command(action, value, sender) {
  const s = pet.state;
  monitor?.command(action,value);
  switch (action) {
    case 'monitor-start': monitor.start(1800);break;
    case 'monitor-stop': await monitor.stop('manual-stop');break;
    case 'pause': s.paused = !s.paused;brain.suspended=s.paused||saving;break;
    case 'cursor': s.cursorEnabled = !s.cursorEnabled; break;
    case 'vision': s.visionEnabled = !s.visionEnabled;
      pet.vision = { ...pet.vision, change: 0, capturedAt: 0, status: s.visionEnabled ? '等待屏幕采样' : '屏幕视觉已关闭' }; break;
    case 'caption': s.showCaption = !s.showCaption; break;
    case 'visual-steering': s.visualSteeringEnabled=!s.visualSteeringEnabled;break;
    case 'ignore-inspector': s.ignoreInspector=!s.ignoreInspector;break;
    case 'feed': sugarWindows.begin();break;
    case 'sugar-place': sugarWindows.confirm(sender,value);break;
    case 'sugar-cancel': sugarWindows.cancel();break;
    case 'sugar-remove': sugarWindows.cancel();pet.removeSugar();break;
    case 'flyvis-source': if(['desktop','right','left','scroll'].includes(value))officialVision.source=value;break;
    case 'silence-gf': pet.brain.silence('gf', !pet.view().gfSilenced); pet.event(`GF ${pet.view().gfSilenced ? '已沉默' : '已恢复'}`); break;
    case 'stimulate':
      if (!['gf','lc4','lplc2','dnp09','dng11','dna02:left','dna02:right'].includes(value)) return;
      pet.stimulate(value); pet.event(`手动刺激 ${value} · 180 ms`); break;
    case 'save': await save(); pet.event('个体与全脑状态已保存'); break;
    case 'inspect': showInspector(); break;
    case 'locate': locateFly(); break;
    case 'quit': app.quit(); return;
    default: return;
  }
  publish();
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock({ smoke })) { app.quit(); return; }
  const { Pet } = await import(pathToFileURL(path.join(ROOT, 'src/core/pet.mjs')).href);
  graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/circuit.json'), 'utf8'));
  let saved = fs.existsSync(saveFile) ? JSON.parse(fs.readFileSync(saveFile, 'utf8')) : undefined;
  if(saved?.version===1&&!fs.existsSync(path.join(runtime,'pet.before-whole-brain.json')))
    fs.copyFileSync(saveFile,path.join(runtime,'pet.before-whole-brain.json'));
  brain=new WholeBrainBridge(ROOT,runtime,graph,log);
  const ready=await brain.ready;
  if(saved?.version===2&&!ready.restoredPet)throw new Error('全脑检查点缺失，已停止启动以保留原个体。');
  const upgraded=saved?.version===1&&!ready.restoredPet;
  saved=ready.restoredPet??saved;
  const display = saved ? screen.getDisplayNearestPoint({ x: pixel(saved.state.x), y: pixel(saved.state.y) }) : screen.getPrimaryDisplay();
  pet = new Pet(graph, { id: randomUUID(), bounds: display.bounds, saved, brain });
  officialVision=new OfficialVision(ROOT,{petId:pet.state.id,learning:saved?.visualLearning});
  lastLearningMeal=pet.state.feedings;
  if(upgraded)pet.event('大脑升级：保留个体经历，全脑神经状态首次初始化');
  ipcMain.handle('bootstrap', () => ({ graph, view: { ...pet.view(), monitor:monitor?.status(), metrics, saveFile,officialVision:officialVision.view } }));
  ipcMain.on('command', (e, action, value) => {command(action, value,e.sender).catch(e=>log(e.message));});
  const work = screen.getPrimaryDisplay().workArea;
  inspector = makeWindow({ width: Math.min(1440, work.width), height: Math.min(1000, work.height),
    minWidth: 1000, minHeight: Math.min(790, work.height), title: 'FlyPet · 观察室', backgroundColor: '#101817', autoHideMenuBar: true }, 'inspector.html', false);
  inspector.on('close', e => { if (!closing && tray) { e.preventDefault(); inspector.hide(); } });
  for(const event of ['show','hide','minimize','restore'])inspector.on(event,()=>{
    inspector.webContents.send('render-activity',inspector.isVisible()&&!inspector.isMinimized());
  });
  overlay = makeWindow({ width: 240, height: 180, transparent: true, frame: false, hasShadow: false,
    resizable: true, focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false }, 'overlay.html');
  overlay.setIgnoreMouseEvents(true);
  overlay.once('ready-to-show', () => {
    overlay.setMinimumSize(1, 1); overlay.setSize(240, 180);
    overlay.setAlwaysOnTop(true,'screen-saver');overlay.showInactive();
    if(process.argv.includes('--locate')) {
      locateFly();
      setTimeout(async()=>{
        try {
          const out=path.join(ROOT,'output','verification');fs.mkdirSync(out,{recursive:true});
          fs.writeFileSync(path.join(out,'located-fly.png'),(await overlay.webContents.capturePage()).toPNG());
          fs.writeFileSync(path.join(out,'located-fly.json'),JSON.stringify({id:pet.state.id,
            visible:overlay.isVisible(),alwaysOnTop:overlay.isAlwaysOnTop(),bounds:overlay.getBounds(),
            displays:screen.getAllDisplays().map(d=>d.bounds),date:new Date().toISOString()},null,2));
        }catch(e){log(e.message);}
      },1500);
    }
  });
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
  sugarWindows=new SugarWindows(makeWindow,pet,publish);
  tray = new Tray(icon); tray.setToolTip('FlyPet · 双击观察');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开观察室', click: showInspector },
    { label: '找到苍蝇', click: locateFly },
    { label: '放置糖水', click: () => command('feed') },
    { label: '移除糖水', click: () => command('sugar-remove') },
    { label: '暂停 / 继续', click: () => command('pause') },
    { label: '保存并退出', click: () => app.quit() },
  ]));
  tray.on('double-click', showInspector);
  monitor=new BehaviorMonitor({root:path.join(ROOT,'output',smoke?'verification/behavior-monitor':'behavior-monitor'),
    getSample:()=>samplePet(pet,officialVision,saving),getEvents:()=>pet.events,getIntake:()=>pet.state.lastIntake,log});
  await monitor.listen(smoke?0:8789);
  let last = performance.now(), saveClock = 0;
  timer = setInterval(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if(saving)return;
    const start = performance.now();
    const point = { x: pixel(pet.state.x), y: pixel(pet.state.y) };
    pet.bounds = screen.getDisplayNearestPoint(point).bounds;
    pet.visualObservation=officialVision.ready&&officialVision.source==='desktop'&&officialVision.view.source==='desktop'?officialVision.view.valueView:null;
    pet.peripheralObservation=officialVision.ready&&officialVision.source==='desktop'&&officialVision.view.source==='desktop'?officialVision.view.peripheralView:null;
    pet.step(dt, screen.getCursorScreenPoint());
    monitor.intake(); // Observe each actual intake step; the trajectory itself is sampled at 10 Hz.
    const intake=pet.state.lastIntake;
    if(intake?.time===pet.state.age&&intake.cue&&intake.meal!==lastLearningMeal&&officialVision.ready){
      lastLearningMeal=intake.meal;
      officialVision.reward(intake.cue,`${pet.state.id}:${intake.meal}`).then(result=>{
        if(result.updated)pet.event(`实际摄入 → 个体视觉价值更新，第 ${result.updates} 次（KC→MBON）`);
      }).catch(e=>log('摄入学习：'+e.message));
    }
    const position=[pixel(pet.state.x-120),pixel(pet.state.y-90)];
    if(!overlayPosition||position[0]!==overlayPosition[0]||position[1]!==overlayPosition[1]){
      overlay.setPosition(...position,false);overlayPosition=position;
    }
    metrics.tickMs = metrics.tickMs * 0.95 + (performance.now() - start) * 0.05;
    publish();
    saveClock += dt;
    if (saveClock >= 15) { saveClock = 0; save().catch(e=>log(e.message)); }
  }, 20);
  captureTimer = setInterval(capture, 350);
  officialTimer=setInterval(()=>{
    if(saving||pet.state.paused||brain.backpressured||!pet.state.visionEnabled){officialVision.lastSent=0;return;}
    const d=screen.getDisplayNearestPoint({x:pixel(pet.state.x),y:pixel(pet.state.y)}).bounds;
    const physical=screen.dipToScreenRect(null,d),scale=physical.width/d.width;
    officialVision.observe(physical,{display:physical,
      x:physical.x+(pet.state.x-d.x)*scale,y:physical.y+(pet.state.y-d.y)*scale,
      heading:pet.state.heading,span:320*scale,forward:80*scale,
      pose:{x:pet.state.x,y:pet.state.y,heading:pet.state.heading},...sensoryMask()},inspector.isVisible()&&!inspector.isMinimized());
  },50);
  if (smoke) {
    const run = require('./smoke.cjs');
    try { await run({ pet, inspector, overlay, metrics, errors, save, saveFile, ROOT,officialVision,sugarWindows,monitor }); }
    catch (e) { log(e.stack); closing=true;clearInterval(timer);clearInterval(captureTimer);clearInterval(officialTimer);await monitor.close();await officialVision.close();await brain.close();app.exit(1);return; }
    app.quit();
  }
}).catch(error => { log(error.stack); require('electron').dialog.showErrorBox('FlyPet 启动失败', error.message); app.exit(1); });

app.on('before-quit', event => {
  if(closing)return;
  event.preventDefault();closing = true; clearInterval(timer); clearInterval(captureTimer);clearInterval(officialTimer);
  sugarWindows?.close();
  Promise.all([save(),monitor?.close()]).catch(e=>log(e.message)).finally(async()=>{if(officialVision)await officialVision.close();if(brain)await brain.close();app.quit();});
});
app.on('window-all-closed', () => app.quit());
app.on('second-instance', (_event,argv) => {
  if(argv.includes('--locate'))locateFly();else if (inspector) showInspector();
});
