"""Parity and same-input CPU benchmark; no desktop capture or live pet state."""
import json,time
import numpy as np
from official_model import ROOT,torch,load_model
from frozen_dynamics import FrozenDynamics,SampledBoxEye
from flyvis.datasets.rendering import BoxEye


def main():
    model=load_model();fast=FrozenDynamics(model)
    rng=np.random.default_rng(19)
    cases=[]
    eye=BoxEye(extent=15,kernel_size=13);sampled_eye=SampledBoxEye(eye)
    eye_error=0.
    for size in [128,403]:
        pictures=rng.random((3,1,size,size),dtype=np.float32)
        with torch.inference_mode():
            expected_eye=eye(torch.from_numpy(pictures))[:,0,0].numpy()
            eye_error=max(eye_error,float(np.max(np.abs(expected_eye-sampled_eye(pictures[:,0])))))
    assert eye_error<2e-6,eye_error
    with torch.inference_mode():
        for batch in [1,3]:
            reference=model.steady_state(1.,.02,batch)
            state=fast.steady_state(1.,batch)
            max_error=float(np.max(np.abs(reference.nodes.activity.numpy()-state)))
            original_wall=original_cpu=fast_wall=fast_cpu=0.
            # Includes long recurrent rollout and three simultaneous value patches.
            for k in range(40):
                x=rng.random((batch,1,1,721),dtype=np.float32)
                steps=[1,2,5,10][k%4]
                start=time.perf_counter();cpu=time.process_time()
                reference=model.simulate(torch.from_numpy(x).repeat(1,steps,1,1),.02,initial_state=reference,as_states=True)[-1]
                original_cpu+=time.process_time()-cpu;original_wall+=time.perf_counter()-start
                start=time.perf_counter();cpu=time.process_time()
                state=fast.advance(x,steps,state)
                fast_cpu+=time.process_time()-cpu;fast_wall+=time.perf_counter()-start
                expected=reference.nodes.activity.numpy()
                max_error=max(max_error,float(np.max(np.abs(expected-state))))
                np.testing.assert_allclose(state,expected,atol=2e-5,rtol=2e-5)
            cases.append(dict(batch=batch,steps=180,maxAbsError=max_error,originalWallMs=original_wall*1000,
                              optimizedWallMs=fast_wall*1000,originalCpuMs=original_cpu*1000,optimizedCpuMs=fast_cpu*1000))
    report={'passed':True,'neurons':fast.n,'edges':fast.edge_count,'dtMs':20,'boxEyeMaxAbsError':eye_error,'cases':cases}
    out=ROOT/'output/performance';out.mkdir(exist_ok=True,parents=True)
    (out/'vision-dynamics.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
