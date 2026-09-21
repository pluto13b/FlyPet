"""Short real-model cue pairing: pixel localization -> flyvis features -> author plasticity."""
import json,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
import worker
from worker import Observer,ROOT
from value_readout import ValueReadout
from regions import regions

worker.draw_cursor=lambda *args:{'visible':False}
start=time.perf_counter();deadline=start+600
out=ROOT/'output/purpose-learning';out.mkdir(parents=True,exist_ok=True)

class World:
    def __init__(self,a=(450,275),b=(420,370)):
        self.image=Image.new('RGB',(800,600),(24,29,31));d=ImageDraw.Draw(self.image)
        x,y=a;d.ellipse((x-20,y-20,x+20,y+20),fill=(40,216,189))
        x,y=b;d.rectangle((x-7,y-25,x+7,y+25),fill=(225,190,70));d.rectangle((x-25,y-7,x+25,y+7),fill=(225,190,70))
    def grab(self,r):
        rgb=np.asarray(self.image.crop((r['left'],r['top'],r['left']+r['width'],r['top']+r['height'])))
        return np.concatenate([rgb[:,:,::-1],np.full((*rgb.shape[:2],1),255,np.uint8)],axis=2)

o=Observer();o.capture.close();world=World();o.capture=world
o.command({'command':'restore','petId':'learning-test'})
camera={'x':300,'y':300,'heading':0.,'span':320,'forward':80,'display':{'x':0,'y':0,'width':800,'height':600},'pose':{'x':300,'y':300,'heading':0}}
def observe():
    o.last_value=0;o.last_peripheral=0
    return o.observe({'source':'desktop','view':camera,'elapsedMs':50,'sentAt':int(time.time()*1000)})
r=observe();cues=r['valueView']['regions']
def nearest(candidates,point):return min(candidates,key=lambda c:np.hypot(c['x']-point[0],c['y']-point[1]))
a=nearest(cues,(450,275));b=nearest(cues,(420,370))
assert a['token']!=b['token']
assert np.hypot(a['x']-450,a['y']-275)<12
fa=o.feature_cache[a['token']]['feature'];fb=o.feature_cache[b['token']]['feature']
before=o.value_memory.score([fa,fb]);history=[]
for i in range(8):
    if time.perf_counter()>deadline:raise TimeoutError('10 minute training budget reached')
    o.value_memory.learn(fa,f'test:{i}')
    history.append(o.value_memory.score([fa,fb]))
after=history[-1]
snapshot=o.command({'command':'checkpoint'})
clone=ValueReadout();clone.restore(snapshot['memory'])
np.testing.assert_allclose(clone.score([fa,fb]),after,atol=1e-10)
assert not clone.learn(fa,'test:7')['updated']
o.capture=World(a=(430,230),b=(440,350));r=observe()
relocated=nearest(r['valueView']['regions'],(430,230));other=nearest(r['valueView']['regions'],(440,350))
assert np.hypot(relocated['x']-430,relocated['y']-230)<12
shifted=o.value_memory.score([o.feature_cache[relocated['token']]['feature'],o.feature_cache[other['token']]['feature']])
report={'before':before,'after':after,'pairings':8,'history':history,'relocatedScores':shifted,
 'preferenceMarginGain':(after[0]-after[1])-(before[0]-before[1]),'seconds':time.perf_counter()-start,
 'device':'CPU','localizedCuePositions':[[c['x'],c['y']] for c in cues],
 'boundary':'Independent test memory; experimental sugar pairing, not formal pet intake. Fixed flyvis weights.'}
stale=o.value_memory.snapshot();o.feature_cache[relocated['token']]['stamp']-=5000
assert not o.command({'command':'reward','petId':'learning-test','token':relocated['token'],'key':'stale'})['updated']
assert stale==o.value_memory.snapshot()
try:o.command({'command':'restore','petId':'another-pet','snapshot':snapshot})
except ValueError:pass
else:raise AssertionError('different pet identity must be rejected')
grey=np.full((403,403),.1,np.float32);yy,xx=np.indices(grey.shape);grey[(xx-240)**2+(yy-160)**2<20**2]=.7
positions=[]
for scale in [1.,1.25,1.5]:
    camera2={'x':-2000+300*scale,'y':400*scale,'heading':.3,'span':320*scale,'forward':80*scale,'pose':{'x':-1200,'y':400,'heading':.3}}
    found=regions(grey,camera2)[0];positions.append([found['x'],found['y']])
np.testing.assert_allclose(positions,np.repeat([positions[0]],3,axis=0),atol=1e-8)
report['checks']=['localize pixels','rewarded preference improves','relocated preference','restore exact weights','duplicate and stale reward rejected','wrong individual rejected','DIP invariant at 100/125/150 percent, negative coordinates']
report['passed']=report['preferenceMarginGain']>.002 and shifted[0]>shifted[1]
(out/'learning-pilot.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
world.image.save(out/'training-scene.png');o.capture.image.save(out/'relocated-scene.png')
np.savez_compressed(out/'paired-memory.npz',weights=o.value_memory.weights,projection=o.value_memory.projections,seeds=o.value_memory.seeds)
print(json.dumps(report),flush=True)
assert report['passed'],report
