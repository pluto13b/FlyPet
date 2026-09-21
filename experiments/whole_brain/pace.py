"""Additional sustained real-time check at a chosen integration timestep."""
from pathlib import Path
import sys,json,time
import numpy as np
import psutil
from engine import WholeBrain

ROOT=Path(__file__).resolve().parents[2]
def measure(dt=2.,duration=30.):
    with np.load(ROOT/'data/whole-brain/connectome.npz') as z:graph={k:z[k] for k in z.files}
    brain=WholeBrain(graph,dt);inputs=graph['pop_central'];brain.run(1.,inputs,100.)
    proc=psutil.Process();before=brain.counts.copy();cpu=time.process_time();start=time.perf_counter();late=0;worst=0;rss=proc.memory_info().rss
    for chunk in range(round(duration/.05)):
        brain.run(.05,inputs,100.)
        remaining=start+(chunk+1)*.05-time.perf_counter()
        if remaining>0:time.sleep(remaining)
        else:late+=1;worst=max(worst,-remaining)
        rss=max(rss,proc.memory_info().rss)
    wall=time.perf_counter()-start;cpu=time.process_time()-cpu;spikes=brain.counts-before
    return {'scenario':'distributed_active','dt_ms':dt,'simulated_seconds':duration,'wall_seconds':wall,
            'cpu_seconds':cpu,'one_core_percent':cpu/wall*100,'machine_cpu_percent':cpu/wall*100/psutil.cpu_count(),
            'deadline_misses':late,'max_lag_ms':worst*1000,'peak_sampled_rss_mib':rss/2**20,
            'spikes':int(spikes.sum()),'active_neurons':int((spikes>0).sum()),'mean_hz_per_neuron':float(spikes.sum()/brain.n/duration)}

if __name__=='__main__':
    dt=float(sys.argv[1]) if len(sys.argv)>1 else 2.
    result=measure(dt)
    path=ROOT/f'output/whole-brain/paced-{dt:g}ms.json'
    path.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)
