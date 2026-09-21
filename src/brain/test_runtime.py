from pathlib import Path
import tempfile,json
import numpy as np
from worker import Runtime,ROOT

with tempfile.TemporaryDirectory(dir=ROOT/'.cache/tmp') as folder:
    a=Runtime(folder)
    assert a.brain.n==138639 and len(a.brain.indices)==15091983
    a.pulses.append({'group':'gf','until':180})
    result=a.step({'ms':50,'inputs':{},'vision':[]})
    assert result['gfSpikes']>0,result
    a.blocked[a.groups['gf']]=True
    result=a.step({'ms':50,'inputs':{'lc4':.3,'lplc2':.3},'vision':[.5]*126})
    assert result['gfSpikes']==0
    assert result['visionFrames']>0 and result['retinaMapped']==8753
    a.save({'state':{'id':'same-individual'}})
    b=Runtime(folder)
    assert b.restored['state']['id']=='same-individual'
    msg={'ms':50,'inputs':{},'vision':[.2]*126}
    a.step(msg);b.step(msg)
    for key in ['v','syn','adapt','ref','ring','counts']:np.testing.assert_array_equal(getattr(a.brain,key),getattr(b.brain,key))
    assert a.brain.rng==b.brain.rng and a.brain.slot==b.brain.slot
    print(json.dumps({'passed':True,'neurons':a.brain.n,'connections':len(a.brain.indices),
        'retinaMapped':result['retinaMapped'],'checks':['GF stimulation','GF silencing','pixel input','exact neural continuation']}))
