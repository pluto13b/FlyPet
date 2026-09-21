from pathlib import Path
import json,time,platform,os
import numpy as np
import numba
import psutil
from engine import WholeBrain,PARAMS

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/whole-brain'

def main():
    proc=psutil.Process()
    t=time.perf_counter()
    with np.load(ROOT/'data/whole-brain/connectome.npz') as z: graph={k:z[k] for k in z.files}
    report={'timestamp':time.strftime('%Y-%m-%d %H:%M:%S'),'python':platform.python_version(),
            'numpy':np.__version__,'numba':numba.__version__,'logical_cpus':psutil.cpu_count(),
            'backend':'single-threaded CPU, Numba sparse event propagation',
            'gpu_tested':False,'load_seconds':time.perf_counter()-t,
            'dataset':json.loads((ROOT/'data/whole-brain/metadata.json').read_text()),
            'parameters':PARAMS,'scenarios':[]}
    empty=np.empty(0,np.int32)
    scenarios=[('silent',empty,0.),('visual_input',graph['pop_photoreceptor'],50.),
               ('distributed_active',graph['pop_central'],100.)]
    t=time.perf_counter();warm=WholeBrain(graph);warm.run(.025,graph['pop_photoreceptor'],50)
    report['jit_warmup_seconds']=time.perf_counter()-t
    del warm
    for dt in [2.,1.,.5]:
        for label,inputs,hz in scenarios:
            brain=WholeBrain(graph,dt)
            brain.run(1.,inputs,hz) # settling is excluded from timed steady state
            before=brain.counts.copy();latencies=[]
            wall=time.perf_counter();cpu=time.process_time();rss=proc.memory_info().rss
            for _ in range(100):
                tick=time.perf_counter();brain.run(.05,inputs,hz);latencies.append(time.perf_counter()-tick)
                rss=max(rss,proc.memory_info().rss)
            wall=time.perf_counter()-wall;cpu=time.process_time()-cpu
            spikes=brain.counts-before
            assert np.isfinite(brain.v).all() and np.isfinite(brain.syn).all()
            row={'scenario':label,'dt_ms':dt,'simulated_seconds':5,'wall_seconds':wall,'real_time_factor':5/wall,
                 'cpu_seconds':cpu,'one_core_percent_unpaced':cpu/wall*100,'peak_sampled_rss_mib':rss/2**20,
                 'external_cells':len(inputs),'external_hz':hz,'spikes':int(spikes.sum()),
                 'active_neurons':int((spikes>0).sum()),'mean_hz_per_neuron':float(spikes.sum()/brain.n/5),
                 'p95_chunk_ms':float(np.percentile(latencies,95)*1000),'max_chunk_ms':max(latencies)*1000,
                 'population_hz':{k[4:]:float(spikes[idx].sum()/max(1,len(idx))/5) for k,idx in graph.items() if k.startswith('pop_')}}
            report['scenarios'].append(row)
            print(json.dumps(row),flush=True)
            (OUT/'benchmark.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            del brain
    # Measured real-time pacing rather than assuming CPU cost from a speed ratio.
    brain=WholeBrain(graph,1.);inputs=graph['pop_central'];brain.run(1.,inputs,100.)
    cpu=time.process_time();start=time.perf_counter();late=0;worst=0;rss=proc.memory_info().rss
    for chunk in range(600):
        brain.run(.05,inputs,100.)
        target=start+(chunk+1)*.05
        remaining=target-time.perf_counter()
        if remaining>0:time.sleep(remaining)
        else:late+=1;worst=max(worst,-remaining)
        rss=max(rss,proc.memory_info().rss)
    duration=time.perf_counter()-start;cpu=time.process_time()-cpu
    report['paced_30s']={'scenario':'distributed_active','dt_ms':1.,'wall_seconds':duration,'simulated_seconds':30,
        'cpu_seconds':cpu,'one_core_percent':cpu/duration*100,'machine_cpu_percent':cpu/duration*100/psutil.cpu_count(),
        'deadline_misses':late,'max_lag_ms':worst*1000,'peak_sampled_rss_mib':rss/2**20}
    print(json.dumps(report['paced_30s']),flush=True)
    (OUT/'benchmark.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':main()
