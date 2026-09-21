"""Whole observer before/after, identical synthetic desktop. Does not capture users' apps."""
import json,time,gc,cProfile,pstats,io
import numpy as np
from worker import Observer,ROOT,torch
import worker
# Fixture does not depend on the user's real cursor movement.
worker.draw_cursor=lambda *args:{'visible':False}

class Capture:
    def grab(self,r):
        y,x=np.indices((r['height'],r['width']))
        c=((x+r['left'])//35%2*180+30).astype(np.uint8)
        return np.stack([c,c,np.roll(c,17,axis=0),np.full_like(c,255)],axis=2)

def run(optimized):
    torch.set_num_threads(4)
    o=Observer(optimized=optimized);o.capture.close();o.capture=Capture()
    camera={'x':400,'y':300,'heading':.5,'span':320,'forward':80,'display':{'x':0,'y':0,'width':1000,'height':700},'pose':{'x':400,'y':300,'heading':.5}}
    messages=[{'source':'desktop','view':camera,'elapsedMs':100,'sentAt':1000+i*100} for i in range(10)]
    # Force the same mix of candidate scoring and peripheral captures, independent of speed.
    def frames():
        results=[]
        for i,m in enumerate(messages):
            o.last_value=0 if i%5==0 else time.perf_counter()
            o.last_peripheral=0 if i%2==0 else time.perf_counter()
            o.last_preview=0 if i%2==0 else time.perf_counter()
            results.append(o.observe(m))
        return results
    profile=cProfile.Profile();start=time.perf_counter();cpu=time.process_time();profile.enable()
    results=frames();profile.disable()
    timing={'wallMs':(time.perf_counter()-start)*1000,'cpuMs':(time.process_time()-cpu)*1000}
    stream=io.StringIO();pstats.Stats(profile,stream=stream).sort_stats('cumtime').print_stats(18)
    (ROOT/f'output/performance/observer-{optimized}-profile.txt').write_text(stream.getvalue())
    del o;gc.collect()
    return results,timing

old,before=run(False);new,after=run(True)
retina_error=max(float(np.max(np.abs(np.array(a['retina'])-b['retina']))) for a,b in zip(old,new))
activity_error=max(float(np.max(np.abs(np.array(a['spatialResponses'][g])-b['spatialResponses'][g]))) for a,b in zip(old,new) for g in a['spatialResponses'])
value_error=max(float(np.max(np.abs(np.array(a['valueView']['scores'])-b['valueView']['scores']))) for a,b in zip(old,new))
assert retina_error<2e-6,retina_error
assert activity_error<2e-5,activity_error
assert value_error<1e-5,value_error
report={'passed':True,'frames':10,'before':before,'after':after,'retinaMaxError':retina_error,'activityMaxError':activity_error,'valueMaxError':value_error}
(ROOT/'output/performance/observer-parity.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
