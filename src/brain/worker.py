"""Full brain owns all neural dynamics. JSON lines are control/telemetry, not model weights."""
from pathlib import Path
import sys,json,time,os,math,ctypes
import numpy as np
from numba import njit
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'experiments/whole_brain'))
from engine import WholeBrain
from PIL import ImageGrab,Image
sys.path.insert(0,str(ROOT/'src/vision'))
from cursor_capture import draw_cursor
from screen_mask import mask_console
ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))

@njit(cache=True)
def advance_live(steps,dt,ptr,post,weights,v,syn,adapt,ref,ring,counts,idx,hz,kick,blocked,threshold,rng,slot):
    dm=np.exp(-dt/20.);ds=np.exp(-dt/5.5);da=np.exp(-dt/500.)
    spikes=np.empty(v.size,np.int32)
    for _ in range(steps):
        for j in range(len(idx)):
            rng=(rng*1664525+1013904223)&0xffffffff
            i=idx[j]
            if not blocked[i] and ref[i]==0 and rng/4294967296.<hz[j]*dt*.001:v[i]+=kick[j]
        fired=0
        for i in range(v.size):
            syn[i]=syn[i]*ds+ring[slot,i];ring[slot,i]=0.;adapt[i]*=da
            if blocked[i]:v[i]=-52.;ref[i]=0
            elif ref[i]>0:ref[i]-=1;v[i]=-52.
            else:
                vinf=-52.+syn[i]-adapt[i];v[i]=vinf+(v[i]-vinf)*dm
                if v[i]>=threshold[i]:
                    v[i]=-52.;ref[i]=max(1,int(round(2.2/dt)));adapt[i]+=8.
                    counts[i]+=1;spikes[fired]=i;fired+=1
        for k in range(fired):
            i=spikes[k]
            for e in range(ptr[i],ptr[i+1]):ring[slot,post[e]]+=weights[e]
        slot=(slot+1)%ring.shape[0]
    return rng,slot

class Runtime:
    def __init__(self,folder):
        self.folder=Path(folder);self.folder.mkdir(parents=True,exist_ok=True)
        with np.load(ROOT/'data/whole-brain/connectome.npz') as z:self.graph={k:z[k] for k in z.files}
        with np.load(ROOT/'data/whole-brain/runtime-map.npz') as z:self.mapping={k:z[k] for k in z.files}
        self.groups={k[6:]:v for k,v in self.mapping.items() if k.startswith('group_')}
        self.brain=WholeBrain(self.graph,2.)
        # WholeBrain retains CSR indices and calibrated weights; raw weights are no longer used.
        del self.graph
        self.time_ms=0.;self.rates=np.zeros(self.brain.n,np.float32)
        self.blocked=np.zeros(self.brain.n,np.bool_);self.threshold=np.full(self.brain.n,-45.,np.float32)
        self.threshold[self.groups['gf']]+=10 # Explicit modeled high GF threshold, not anatomy.
        self.pulses=[];self.restored=None;self.last_vision_frames=0
        path=self.folder/'full-brain.npz'
        if path.exists():
            with np.load(path,allow_pickle=False) as z:
                meta=json.loads(str(z['metadata']))
                if meta['neurons']!=self.brain.n:raise ValueError('Full-brain checkpoint size mismatch')
                for k in ['v','syn','adapt','ref','ring','counts']:
                    if z[k].shape!=getattr(self.brain,k).shape:raise ValueError('Invalid brain checkpoint '+k)
                    getattr(self.brain,k)[:]=z[k]
                self.rates[:]=z['rates'];self.blocked[:]=z['blocked']
                self.brain.rng=meta['rng'];self.brain.slot=meta['slot'];self.time_ms=meta['time_ms']
                self.restored=meta['pet'];self.pulses=meta.get('pulses',[])
        self.compute(0,np.empty(0,np.int32),np.empty(0,np.float32),np.empty(0,np.float32))

    def compute(self,ms,idx,hz,kick):
        b=self.brain
        b.rng,b.slot=advance_live(round(ms/2),2.,b.indptr,b.indices,b.weights,b.v,b.syn,b.adapt,b.ref,b.ring,
                                  b.counts,idx,hz,kick,self.blocked,self.threshold,b.rng,b.slot)

    def step(self,message):
        ms=max(2,min(50,int(message.get('ms',50))//2*2));input_rates=np.zeros(self.brain.n,np.float32)
        amplitudes=np.full(self.brain.n,12.,np.float32)
        inputs=message.get('inputs',{})
        for name,current in inputs.items():
            group=self.groups.get(name,np.empty(0,np.int32))
            input_rates[group]=max(0.,float(current))*600.
        central=self.groups['central'];input_rates[central]=4.;amplitudes[central]=4.
        vision=message.get('vision',[])
        if len(vision)==126:
            lum=np.clip(np.array(vision,np.float32),0,1)
            input_rates[self.mapping['retina_idx']]=3.+lum[self.mapping['retina_bin']]*45.
            self.last_vision_frames+=1
        self.pulses=[p for p in self.pulses if p['until']>self.time_ms]
        for pulse in self.pulses:
            ids=self.groups[pulse['group']];input_rates[ids]=250.;amplitudes[ids]=35.
        idx=np.flatnonzero(input_rates>0).astype(np.int32);before=self.brain.counts.copy();start=time.perf_counter()
        self.compute(ms,idx,input_rates[idx],amplitudes[idx]);self.time_ms+=ms
        delta=self.brain.counts-before;alpha=1-np.exp(-ms/120.)
        self.rates*=(1-alpha);self.rates+=delta*(1000/ms)*alpha
        return self.telemetry(delta,int(ms),time.perf_counter()-start)

    def telemetry(self,delta=None,ms=0,wall=0.):
        if delta is None:delta=np.zeros(self.brain.n,np.int64)
        probes=self.mapping['probe_idx'];valid=probes>=0;pr=np.zeros(len(probes),np.float32);pr[valid]=self.rates[probes[valid]]
        return {'timeMs':self.time_ms,'totalSpikes':int(self.brain.counts.sum()),
            'gfSpikes':int(delta[self.groups['gf']].sum()),'rates':{k:float(self.rates[v].mean()) if len(v) else 0. for k,v in self.groups.items()},
            'probeRates':pr.tolist(),'gfSilenced':bool(self.blocked[self.groups['gf']].all()),
            'activeNeurons':int((delta>0).sum()),'meanHz':float(self.rates.mean()),'computeMs':wall*1000,
            'visionFrames':self.last_vision_frames,'retinaMapped':len(self.mapping['retina_idx']),
            'neurons':self.brain.n,'connections':len(self.brain.indices),'dtMs':2}

    def save(self,pet):
        b=self.brain;meta={'neurons':b.n,'time_ms':self.time_ms,'rng':int(b.rng),'slot':int(b.slot),'pet':pet,'pulses':self.pulses}
        temp=self.folder/'full-brain.tmp.npz'
        np.savez(temp,**{k:getattr(b,k) for k in ['v','syn','adapt','ref','ring','counts']},rates=self.rates,
                 blocked=self.blocked,metadata=np.array(json.dumps(meta)))
        os.replace(temp,self.folder/'full-brain.npz')
        return {'saved':True,'timeMs':self.time_ms}

    def capture(self,message):
        p=message['physical'];b=message['bounds'];fly=message['fly'];previous=message.get('previous',[])
        raw=ImageGrab.grab(bbox=(p['x'],p['y'],p['x']+p['width'],p['y']+p['height']),all_screens=True).convert('RGB')
        rgb=np.array(raw);mask_console(rgb,p,message.get('excludeRects',[]),message.get('foodPixels'))
        cursor=draw_cursor(rgb,p);frame=Image.fromarray(rgb).resize((640,400))
        pixels=frame.load();values=[];eyes={'left':[],'right':[]};change=0.
        for eye,offset in [('left',-.6),('right',.6)]:
            angle=fly['heading']+offset
            for row in range(7):
                for col in range(9):
                    u=45+(col-4)*14;v=(row-3)*14+(col%2)*7
                    sx=fly['x']+u*math.cos(angle)-v*math.sin(angle)
                    sy=fly['y']+u*math.sin(angle)+v*math.cos(angle)
                    x=int(max(0,min(1,(sx-b['x'])/b['width']))*639)
                    y=int(max(0,min(1,(sy-b['y'])/b['height']))*399)
                    r,g,blue=pixels[x,y];lum=(.2126*r+.7152*g+.0722*blue)/255
                    change+=abs(lum-(previous[len(values)] if len(previous)==126 else lum))
                    values.append(lum);eyes[eye].append(lum)
        return {'values':values,'eyes':eyes,'change':change/126,'luminance':sum(values)/126,'cursorInFrame':cursor['visible']}

def main():
    runtime=Runtime(sys.argv[1]);print(json.dumps({'ready':True,'restoredPet':runtime.restored,'view':runtime.telemetry()}),flush=True)
    for line in sys.stdin:
        try:
            msg=json.loads(line);cmd=msg['command']
            if cmd=='step':result=runtime.step(msg)
            elif cmd=='stimulate':
                runtime.pulses.append({'group':msg['group'],'until':runtime.time_ms+180});result={'ok':True}
            elif cmd=='silence':runtime.blocked[runtime.groups['gf']]=msg['enabled'];result={'ok':True}
            elif cmd=='save':result=runtime.save(msg['pet'])
            elif cmd=='capture':result=runtime.capture(msg)
            elif cmd=='capture-point':
                p=msg['point'];im=ImageGrab.grab(bbox=(p['x'],p['y'],p['x']+1,p['y']+1),all_screens=True).convert('RGB')
                result={'rgb':list(im.getpixel((0,0)))}
            elif cmd=='quit':break
            else:raise ValueError('Unknown worker command')
            print(json.dumps({'id':msg['id'],'result':result}),flush=True)
        except Exception as e:print(json.dumps({'id':msg.get('id'),'error':str(e)}),flush=True)
if __name__=='__main__':main()
