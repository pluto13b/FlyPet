# SPDX-License-Identifier: GPL-3.0-or-later
# Based on IncentiveCircuit by Evripidis Gkanias, University of Edinburgh.
# Upstream license: research/learning/InsectRobotics__IncentiveCircuit/upstream/LICENSE
"""Small torch CUDA arithmetic adapter, checked against every upstream state/weight.

This is an experimental translation of GPLv3+ IncentiveCircuit update equations,
not a new biological rule. Upstream remains the reference and is unmodified.
"""
import json,time,sys
from pathlib import Path
import numpy as np
import torch
from pilot import IncentiveCircuit,conditioning,OUT

def run_cuda(models,stimuli,seeds):
    device='cuda';dtype=torch.float64
    def tensor(x):return torch.as_tensor(x,dtype=dtype,device=device)
    model=models[0];batch=len(models);steps=len(stimuli)
    noise=tensor(np.stack([np.random.RandomState(seed).rand(steps,model.nb_kc) for seed in seeds]))
    p2k=tensor(model.w_p2k);u2d=tensor(model.w_u2d);m2v=tensor(model.w_m2v);d2k=tensor(model.w_d2k)
    bias=tensor(model.bias.copy());rest=tensor(model.w_rest.copy());stim=tensor(stimuli)
    v=tensor(np.stack([m._v[0] for m in models]));w=tensor(np.stack([m.w_k2m[0] for m in models]))
    vh=torch.empty((batch,steps+1,12),device=device,dtype=dtype)
    wh=torch.empty((batch,steps+1,model.nb_kc,12),device=device,dtype=dtype)
    vh[:,0]=v;wh[:,0]=w
    eta_v=(1/model.nb_timesteps)**(1/model.nb_timesteps)
    eta_w=1/max(model.nb_timesteps-1,1)
    torch.cuda.synchronize();start=time.perf_counter()
    with torch.inference_mode():
        for t in range(steps):
            k=stim[t,:2]@p2k+noise[:,t]*.001
            indices=torch.argsort(k,dim=1)[:,:-model._nb_active_kcs]
            k=k.scatter(1,indices,0.)
            mb=torch.clamp(torch.einsum('bk,bkj->bj',k,w)+stim[t,2:]@u2d+bias,-100,100)
            vp=v.clone();wp=w.clone()
            for _ in range(4):
                vo=torch.clamp(vp+eta_v*(mb@m2v-2*vp),0,2)
                D=torch.clamp_min(vo,0)@d2k
                wo=torch.clamp(wp+eta_w*D[:,None,:]*(k[:,:,None]+wp-rest),0,50)
                vp=vp+.25*(vo-vp);wp=wp+.25*(wo-wp)
            v=vo;w=wo;vh[:,t+1]=v;wh[:,t+1]=w
    torch.cuda.synchronize();seconds=time.perf_counter()-start
    return vh.cpu().numpy(),wh.cpu().numpy(),seconds

def main():
    report={'torch':torch.__version__,'built_cuda':torch.version.cuda,'cuda_available':torch.cuda.is_available(),
            'python':sys.executable,'dtype':'float64','timing_note':'CPU model calls only; GPU synchronized kernel loop only, excludes imports and transfers'}
    if not report['cuda_available']:
        (OUT/'gpu-comparison.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));return
    report['gpu']=torch.cuda.get_device_name(0)
    models=[];cpu_times=[]
    for seed in range(32):
        model,stim,row=conditioning(seed);models.append(model);cpu_times.append(row['seconds'])
    # Warm-up before timings; then repeat the same workload three times.
    run_cuda(models[:1],stim,[0])
    timings={}
    for batch in (1,32):
        trials=[]
        for _ in range(3):
            v,w,seconds=run_cuda(models[:batch],stim,list(range(batch)));trials.append(seconds)
        vref=np.stack([m._v for m in models[:batch]])
        wref=np.stack([m.w_k2m for m in models[:batch]])
        err=max(float(np.max(abs(v-vref))),float(np.max(abs(w-wref))))
        assert err<1e-9,err
        timings[str(batch)]={'gpu_seconds_median':float(np.median(trials)),
                            'cpu_seconds':sum(cpu_times[:batch]),'max_abs_error':err}
    report['batches']=timings;report['parity_passed']=True
    np.savez_compressed(OUT/'gpu-trained-memory.npz',seeds=np.arange(32),
                        initial_weights=w[:,0],acquired_weights=w[:,36],
                        final_weights=w[:,-1],acquired_activity=v[:,36],final_activity=v[:,-1],
                        stimuli=stim,source_commit='1610c80072fe8bb59bd397e7a61f716393a509b9')
    (OUT/'gpu-comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
