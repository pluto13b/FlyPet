"""Exercise official spatial output and frozen memory without touching the live pet."""
import json,time,io,base64
from PIL import Image
import numpy as np
from worker import Observer,ROOT,GROUPS
from value_readout import ValueReadout

start=time.perf_counter();readout=ValueReadout()
with np.load(ROOT/'output/visual-learning/category/features.npz') as data:features=data['features'][:4]
previous=json.loads((ROOT/'output/visual-learning/category/results.json').read_text())
expected=[r['score'] for r in previous['rows'][:4]]
scores=readout.score(features);error=float(np.max(np.abs(np.array(scores)-expected)))
assert error<1e-6,error
o=Observer()
for mode in ['right','left','scroll']:
    for _ in range(3):result=o.observe({'source':mode,'elapsedMs':50,'sentAt':int(time.time()*1000)})
    assert result['valueView'] is None and not result['controlsBody']
    assert all(len(result['spatialResponses'][g])==721 for g in GROUPS)
    assert all(np.isfinite(result['spatialResponses'][g]).all() for g in GROUPS)
    assert max(np.ptp(result['spatialResponses'][g]) for g in GROUPS)>1e-5

class TestCapture:
    def grab(self,r):
        y,x=np.indices((r['height'],r['width']));v=((x+r['left'])//35%2*180+30).astype(np.uint8)
        return np.stack([v,v,v,np.full_like(v,255)],axis=2)
o.capture.close();o.capture=TestCapture()
cam={'x':300,'y':240,'heading':0.,'span':320,'forward':80,
     'display':{'x':0,'y':0,'width':800,'height':600},'pose':{'x':300,'y':240,'heading':0}}
r=o.observe({'source':'desktop','view':cam,'elapsedMs':50,'sentAt':int(time.time()*1000)})
assert r['valueView']['available'] and len(r['valueView']['scores'])==3
assert len(r['previewRetina'])==721
assert np.isfinite(r['valueView']['scores']).all()
cam['x']+=20;cam['heading']+=.2
r=o.observe({'source':'desktop','view':cam,'elapsedMs':50,'sentAt':int(time.time()*1000)})
assert r['egoMotion']['selfMotion']
cam['excludeRects']=[cam['display']]
r=o.observe({'source':'desktop','view':cam,'elapsedMs':50,'sentAt':int(time.time()*1000)})
assert r['inputInfo']['consoleMasked'] and r['inputInfo']['nearUniform']
preview=np.asarray(Image.open(io.BytesIO(base64.b64decode(r['scenePreview'].split(',')[1]))))
assert preview.std()>20 # Actual acquired stripes remain visible in human reference.
cam['excludeRects']=[]
r=o.observe({'source':'desktop','view':cam,'elapsedMs':50,'sentAt':int(time.time()*1000)})
assert not r['inputInfo']['consoleMasked'] and not r['inputInfo']['nearUniform']
report={'passed':True,'columns':721,'channels':8,'frozen_score_max_error':error,
        'checks':['spatial contrast and finite activity','test patterns cannot steer','three actual image patches scored','pose change reports self motion','console mask creates grey input while raw preview retains detail','disabling mask restores input detail'],
        'seconds':time.perf_counter()-start}
(ROOT/'output/verification/spatial-vision.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
