"""Bounded, synthetic memory diagnostic for observer allocations."""
import sys,json,time,gc
import psutil
import numpy as np
from worker import Observer,ROOT
import worker
worker.draw_cursor=lambda *args:{'visible':False}
p=psutil.Process();rows=[]
def record(label):
    gc.collect();m=p.memory_info()
    rows.append({'label':label,'rssMB':m.rss/2**20,'privateMB':m.private/2**20})
    print(json.dumps(rows[-1]),flush=True)
class Capture:
    def grab(self,r):
        a=np.empty((r['height'],r['width'],4),np.uint8);a[:]=[90,120,180,255];return a
record('imported')
o=Observer(optimized=sys.argv[1]=='optimized');o.capture.close();o.capture=Capture()
record('initialized')
camera={'x':400,'y':300,'heading':.5,'span':400,'forward':100,'display':{'x':0,'y':0,'width':2560,'height':1440},'pose':{'x':320,'y':240,'heading':.5}}
for phase in ['desktop','right','left','scroll','desktop']:
    for i in range(20):
        o.last_peripheral=0;o.last_preview=0
        o.observe({'source':phase,'view':camera,'elapsedMs':100,'sentAt':int(time.time()*1000)})
    record(phase)
(ROOT/f'output/performance/memory-{sys.argv[1]}.json').write_text(json.dumps(rows,indent=2))
