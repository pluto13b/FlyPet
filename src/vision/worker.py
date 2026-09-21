"""Official visual dynamics plus a separate, explicitly engineered frozen value readout."""
import sys,json,time,ctypes,io,base64,gc,os
from PIL import Image
import numpy as np
from official_model import ROOT,torch,flyvis,load_model
from flyvis.datasets.rendering import BoxEye
from mss import mss
from cursor_capture import draw_cursor
from test_patterns import pattern,LABELS
from view_geometry import capture_region,orient_image,project_point,SIZE
from value_readout import ValueReadout
from screen_mask import mask_console
from peripheral import PeripheralSensor
from frozen_dynamics import FrozenDynamics,SampledBoxEye
from regions import regions

ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
GROUPS=['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d']

class Observer:
    def __init__(self, optimized=True):
        self.optimized=optimized
        if optimized:torch.set_num_threads(1)
        self.model=load_model();self.eye=BoxEye(extent=15,kernel_size=13)
        types=self.model.connectome.nodes.type[:].astype(str)
        u=self.model.connectome.nodes.u[:];v=self.model.connectome.nodes.v[:]
        self.ids={g:np.flatnonzero((types==g)&(np.abs(u)<=3)&(np.abs(v)<=3)) for g in GROUPS}
        coordinates=[(a,b) for a in range(-15,16) for b in range(max(-15,-15-a),min(15,15-a)+1)]
        self.spatial_ids={}
        for g in GROUPS:
            lookup={(int(u[i]),int(v[i])):i for i in np.flatnonzero(types==g)}
            self.spatial_ids[g]=np.array([lookup[c] for c in coordinates])
        self.tm3=np.flatnonzero(types=='Tm3')
        self.fast=FrozenDynamics(self.model) if optimized else None
        self.fast_eye=SampledBoxEye(self.eye) if optimized else None
        if optimized:
            self.state=self.fast.steady_state(1.)
            self.value_state=np.repeat(self.state,3,axis=0)
            baseline=self.state
            self.model=None  # Runtime needs only compiled weights, not the training graph/parameter readers.
            gc.collect()
        else:
            self.state=self.model.steady_state(1.,.02,1)
            self.value_state=self.model.steady_state(1.,.02,3)
            baseline=self.state.nodes.activity.numpy()
        self.spatial_reference={g:baseline[0,idx].copy() for g,idx in self.spatial_ids.items()}
        self.reference={g:float(baseline[0,self.ids[g]].mean()) for g in GROUPS}
        self.capture=mss();self.frames=0;self.simulated=0.;self.mode='desktop';self.phase=0.
        self.previous_camera=None;self.previous_time=None;self.last_value=0.;self.value_view=None
        self.peripheral=PeripheralSensor();self.peripheral_view=None;self.last_peripheral=0.
        self.scene_preview=None;self.preview_retina=None;self.last_preview=0.
        self.last_mask=None
        self.feature_cache={};self.pet_id=None;self.learning_result=None
        self.centers=self.eye.receptor_centers.cpu().numpy()+np.array([SIZE//2,SIZE//2])
        try:self.value_memory=ValueReadout();self.value_error=None
        except Exception as exc:self.value_memory=None;self.value_error=str(exc)

    def observe(self,msg):
        started=time.perf_counter();mode=msg.get('source','desktop');preview_enabled=msg.get('preview',True)
        if mode!=self.mode:
            self.state=self.fast.steady_state(.5) if self.optimized else self.model.steady_state(.5,.02,1)
            self.phase=0.;self.mode=mode
            self.value_view=None;self.last_value=0.;self.previous_camera=None
            self.peripheral.reset();self.peripheral_view=None;self.last_peripheral=0.
            self.last_preview=0.
        dt=max(.02,min(.2,msg.get('elapsedMs',40)/1000))
        update_preview=preview_enabled and started-self.last_preview>=.2
        if mode=='desktop':
            camera=msg['view'];r=capture_region(camera)
            raw_wide=None
            mask_key=tuple(tuple(rect[k] for k in ['x','y','width','height']) for rect in camera.get('excludeRects',[]))
            if mask_key!=self.last_mask:
                self.value_view=None;self.last_value=0.;self.last_preview=0.
                self.peripheral.reset();self.last_peripheral=0.;self.last_mask=mask_key
                update_preview=preview_enabled
            if started-self.last_peripheral>=.2:
                d=camera['display']
                raw_wide=np.asarray(self.capture.grab({'left':d['x'],'top':d['y'],'width':d['width'],'height':d['height']}))[:,:,:3][:,:,::-1].copy()
                wide=raw_wide.copy()
                mask_console(wide,d,camera.get('excludeRects',[]),camera.get('foodPixels'));draw_cursor(wide,d)
                self.peripheral_view=self.peripheral.observe(wide,d,camera,msg.get('sentAt',0))
                self.last_peripheral=started
            if r['width'] and r['height']:
                if raw_wide is not None:
                    dx=r['x']-d['x'];dy=r['y']-d['y']
                    rgb=raw_wide[dy:dy+r['height'],dx:dx+r['width']].copy()
                else:
                    image=np.asarray(self.capture.grab({'left':r['x'],'top':r['y'],'width':r['width'],'height':r['height']}))
                    rgb=image[:,:,:3][:,:,::-1].copy()
                cursor=draw_cursor(rgb,r)
            else:rgb=np.empty((0,0,3),np.uint8);cursor={'visible':False}
            preview=orient_image(rgb,r,camera) if update_preview else None
            if camera.get('excludeRects'):
                mask_console(rgb,r,camera['excludeRects'],camera.get('foodPixels'));cursor=draw_cursor(rgb,r)
                rgb=orient_image(rgb,r,camera)
            else:rgb=preview if preview is not None else orient_image(rgb,r,camera)
            if cursor['visible']:
                cursor['x'],cursor['y']=project_point(camera,r['x']+cursor['x'],r['y']+cursor['y'])
                cursor['visible']=0<=cursor['x']<SIZE and 0<=cursor['y']<SIZE
            grey=(rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722).astype(np.float32)/255
        else:
            self.phase+=dt
            grey=pattern(mode,self.phase);cursor={'visible':False}
            preview=np.repeat(np.clip(grey*255,0,255).astype(np.uint8)[:,:,None],3,axis=2) if preview_enabled else None
        if update_preview:
            buffer=io.BytesIO();Image.fromarray(preview).save(buffer,format='JPEG',quality=85)
            self.scene_preview='data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode('ascii');self.last_preview=started
        with torch.inference_mode():
            retina=torch.from_numpy(self.fast_eye(grey)[:,None,None]) if self.optimized else self.eye(torch.as_tensor(grey,device=flyvis.device)[None,None])
            if update_preview:self.preview_retina=retina[0,0,0].cpu().tolist()
            steps=max(1,round(dt/.02))
            if self.optimized:
                self.state=self.fast.advance(retina.numpy(),steps,self.state)
            else:self.state=self.model.simulate(retina.repeat(1,steps,1,1),.02,initial_state=self.state,as_states=True)[-1]
            activity=self.state if self.optimized else self.state.nodes.activity.numpy()
            signals={g:float(activity[0,idx].mean())-self.reference[g] for g,idx in self.ids.items()}
            spatial={g:(activity[0,idx]-self.spatial_reference[g]).tolist() for g,idx in self.spatial_ids.items()} if preview_enabled else None
            if mode=='desktop' and self.value_memory and started-self.last_value>=.5:
                # Three image-only candidate windows in body coordinates; no object locations.
                patches=np.stack([grey[40:241,x:x+201] for x in [0,101,202]])
                tensor=torch.as_tensor(patches,device=flyvis.device)[:,None]
                tensor=torch.nn.functional.interpolate(tensor,size=(403,403),mode='bilinear',align_corners=False)
                if self.optimized:
                    candidate_retina=self.fast_eye(tensor[:,0].numpy())
                    value_activity=self.fast.advance(candidate_retina,5,self.value_state)
                else:
                    candidate_retina=self.eye(tensor)
                    value_activity=self.model.simulate(candidate_retina.repeat(1,5,1,1),.02,initial_state=self.value_state,as_states=True)[-1].nodes.activity.numpy()
                scores=self.value_memory.score(value_activity[:,self.tm3])
                candidates=regions(grey,camera)
                if candidates:
                    images=np.stack([c.pop('pixels') for c in candidates])
                    if self.optimized:
                        inputs=self.fast_eye(images)
                        features=self.fast.advance(inputs,5,np.repeat(self.value_state[:1],len(candidates),axis=0))[:,self.tm3]
                    else:
                        inputs=self.eye(torch.from_numpy(images[:,None]))
                        initial=self.model.steady_state(1.,.02,len(candidates))
                        features=self.model.simulate(inputs.repeat(1,5,1,1),.02,initial_state=initial,as_states=True)[-1].nodes.activity.numpy()[:,self.tm3]
                    values=self.value_memory.score(features)
                    stamp=msg.get('sentAt',0)
                    self.feature_cache={k:v for k,v in self.feature_cache.items() if stamp-v['stamp']<3000}
                    for i,(candidate,feature,value) in enumerate(zip(candidates,features,values)):
                        token=f'{stamp}:{self.frames}:{i}'
                        candidate.update(token=token,score=float(value))
                        self.feature_cache[token]={'feature':feature.copy(),'stamp':stamp}
                self.value_view={'scores':scores,'angles':[-.56,0,.56],
                                 'capturedAt':msg.get('sentAt',0),'pose':camera.get('pose'),
                                 'regions':candidates,
                                 'source':'desktop','available':True}
                self.last_value=started
        ego={'translationPerSecond':0.,'rotationPerSecond':0.,'selfMotion':False}
        if mode=='desktop':
            if self.previous_camera and self.previous_time:
                elapsed=max(.001,started-self.previous_time);scale=camera['span']/320
                distance=np.hypot(camera['x']-self.previous_camera['x'],camera['y']-self.previous_camera['y'])/scale
                delta=camera['heading']-self.previous_camera['heading'];delta=np.arctan2(np.sin(delta),np.cos(delta))
                ego={'translationPerSecond':float(distance/elapsed),'rotationPerSecond':float(delta/elapsed),
                     'selfMotion':bool(distance/elapsed>5 or abs(delta/elapsed)>.15)}
            self.previous_camera=camera.copy();self.previous_time=started
        self.frames+=1;self.simulated+=steps*.02
        cursor_column=None
        if cursor['visible']:
            centers=self.centers
            distances=np.sum((centers-np.array([cursor['y'],cursor['x']]))**2,axis=1)
            if distances.min()<20**2:cursor_column=int(distances.argmin())
        if update_preview:self.preview_cursor_column=cursor_column
        return {'status':'官方模型在线','source':mode,'frames':self.frames,'model':'flyvis 1.2.0 · flow/0000/000',
            'neurons':45669,'connections':1513231,'columns':721,'device':str(flyvis.device),
            'engine':'fixed-weight-csr' if self.optimized else 'official-reference',
            'retina':retina[0,0,0].cpu().tolist(),'responses':signals,'wallMs':(time.perf_counter()-started)*1000,
            'simulatedSeconds':self.simulated,'controlsBody':mode=='desktop',
            'controlKind':'视觉区域／个体价值／工程目的；未重建全脑视觉连接','sourceLabel':LABELS[mode],
            'spatialResponses':spatial,'egoMotion':ego,
            'peripheralView':self.peripheral_view if mode=='desktop' else None,
            'scenePreview':self.scene_preview if preview_enabled else None,
            'previewRetina':self.preview_retina if preview_enabled else None,
            'previewCursorColumn':getattr(self,'preview_cursor_column',None),
            'inputInfo':{'contrast':float(grey.std()),'nearUniform':bool(np.percentile(grey,95)-np.percentile(grey,5)<.01),
                         'cursorProjected':[cursor.get('x'),cursor.get('y')],
                         'consoleMasked':bool(mode=='desktop' and camera.get('excludeRects'))},
            'valueView':self.value_view if mode=='desktop' else None,'valueError':self.value_error,
            'learning':{**self.value_memory.status(),'lastResult':self.learning_result} if self.value_memory else None,
            'cursorInFrame':cursor['visible'],'cursorColumn':cursor_column,
            'viewMode':'body-relative-forward' if mode=='desktop' else 'test-pattern'}

    def command(self,msg):
        if not self.value_memory:raise ValueError(self.value_error or '学习回路未加载')
        if msg['command']=='restore':
            self.pet_id=msg['petId'];snapshot=msg.get('snapshot')
            if snapshot and snapshot.get('petId')!=self.pet_id:raise ValueError('学习记忆与个体 ID 不匹配')
            self.value_memory.restore(snapshot.get('memory') if snapshot else None)
            return self.value_memory.status()
        if msg['command']=='checkpoint':return {'petId':self.pet_id,'memory':self.value_memory.snapshot()}
        if msg['command']=='reward':
            cached=self.feature_cache.get(msg.get('token'))
            if self.mode!='desktop' or not cached or time.time()*1000-cached['stamp']>3000:
                self.learning_result={'updated':False,'reason':'摄入线索过期或未配对'}
            elif msg.get('petId')!=self.pet_id:raise ValueError('奖励个体 ID 不匹配')
            else:
                self.learning_result=self.value_memory.learn(cached['feature'],msg['key'])
                self.last_value=0
            return self.learning_result
        raise ValueError('Unknown visual command')

def main():
    observer=Observer(optimized=os.environ.get('FLYPET_REFERENCE_VISION')!='1');print(json.dumps({'ready':True,'status':'官方模型已加载','columns':721}),flush=True)
    try:
        for line in sys.stdin:
            msg=json.loads(line)
            if msg.get('command')=='quit':break
            try:print(json.dumps({'id':msg.get('id'),'result':observer.observe(msg) if msg.get('command')=='observe' else observer.command(msg)}),flush=True)
            except Exception as exc:print(json.dumps({'id':msg.get('id'),'error':str(exc)}),flush=True)
    finally:observer.capture.close()

if __name__=='__main__':main()
