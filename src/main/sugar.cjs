const {screen}=require('electron');
const {pixel}=require('./coordinates.cjs');
class SugarWindows {
  constructor(makeWindow,pet,publish){
    this.makeWindow=makeWindow;this.pet=pet;this.publish=publish;this.placements=[];this.positionKey='';this.contentKey='';
    this.drop=makeWindow({width:160,height:120,frame:false,transparent:true,hasShadow:false,
      focusable:false,skipTaskbar:true,alwaysOnTop:true,show:false},'sugar.html',false);
    this.drop.setIgnoreMouseEvents(true);this.drop.setAlwaysOnTop(true,'screen-saver');
    this.drop.webContents.on('did-finish-load',()=>this.sync());
  }
  get placing(){return this.placements.length>0;}
  begin(){
    this.cancel();
    const current=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    for(const display of screen.getAllDisplays()){
      const w=this.makeWindow({...display.bounds,frame:false,transparent:true,hasShadow:false,
        skipTaskbar:true,alwaysOnTop:true,show:false},'sugar-place.html');
      this.placements.push(w);w.setAlwaysOnTop(true,'screen-saver');
      w.once('ready-to-show',()=>{if(w.isDestroyed())return;w.setBounds(display.bounds);if(display.id===current){w.show();w.focus();}else w.showInactive();});
      w.webContents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'&&input.key==='Escape')this.cancel();});
      w.on('closed',()=>{this.placements=this.placements.filter(p=>p!==w);});
    }
    this.publish();
  }
  confirm(sender,value){
    const w=this.placements.find(w=>w.webContents===sender);
    if(!w||!value||!Number.isFinite(value.x)||!Number.isFinite(value.y))return;
    const b=w.getBounds();
    this.pet.placeSugar({x:b.x+Math.max(0,Math.min(b.width-1,value.x)),y:b.y+Math.max(0,Math.min(b.height-1,value.y))});
    this.cancel();this.sync();this.publish();
  }
  cancel(){const old=this.placements;this.placements=[];for(const w of old)if(!w.isDestroyed())w.destroy();this.publish();}
  sync(){
    if(this.drop.isDestroyed())return;
    const f=this.pet.state.sugar;
    if(!f){if(this.drop.isVisible())this.drop.hide();this.positionKey='';this.contentKey='';return;}
    const key=`${f.x},${f.y}`;
    const moved=key!==this.positionKey;
    if(moved){this.drop.setPosition(pixel(f.x-80),pixel(f.y-60));this.positionKey=key;}
    if(!this.drop.webContents.isLoading()){
      const contentKey=`${key}:${f.remaining.toFixed(1)}`;
      if(contentKey!==this.contentKey){this.drop.webContents.send('sugar',f);this.contentKey=contentKey;}
      if(!this.drop.isVisible()){this.drop.showInactive();this.drop.moveTop();}
      else if(moved)this.drop.moveTop();
    }
  }
  close(){this.cancel();if(!this.drop.isDestroyed())this.drop.destroy();}
}
module.exports={SugarWindows};
