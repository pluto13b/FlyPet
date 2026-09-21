import json
from pathlib import Path
import numpy as np
from peripheral import PeripheralSensor

d={'x':0,'y':0,'width':1024,'height':1024}
c={'x':512,'y':512,'heading':0,'span':320,'pose':{'x':512,'y':512,'heading':0}}
image=np.full((1024,1024,3),40,np.uint8);sensor=PeripheralSensor()
assert not sensor.observe(image,d,c,1000)['baselineReady']
image[464:560,160:256]=240
rear=sensor.observe(image,d,c,1200)
assert max(rear['sectors'],key=lambda s:s['change'])['sector']==4
assert rear['sectors'][4]['change']>.1
c['heading']=1.;c['x']+=20
still=sensor.observe(image,d,c,1400)
assert max(s['change'] for s in still['sectors'])==0 # body movement alone causes no pulse
c['excludeRects']=[{'x':0,'y':0,'width':20,'height':20}]
assert not sensor.observe(image,d,c,1600)['baselineReady']
assert not sensor.observe(image,d,c,4000)['baselineReady']
# A corner has sectors entirely outside the sampled screen.
c.update(x=0,y=0,heading=0)
edge=sensor.observe(image,d,c,4200);assert any(s['samples']==0 for s in edge['sectors'])
out=Path(__file__).resolve().parents[2]/'output/verification/peripheral-sensor.json'
out.write_text(json.dumps({'passed':True,'checks':['rear change detected','body movement does not produce image change','mask/gap resets baseline','screen boundary coverage']}))
print('Peripheral sensor checks passed')
