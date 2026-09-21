"""FlyPet-authored sparse LIF benchmark. Not a reproduction of a complete animal."""
import math
import numpy as np
from numba import njit

PARAMS = dict(rest_mv=-52.,threshold_mv=-45.,tau_membrane_ms=20.,tau_synapse_ms=5.5,
              refractory_ms=2.2,delay_ms=1.8,adaptation_mv=8.,tau_adaptation_ms=500.,psp_peak_mv=.275,
              external_kick_mv=12.,inhibitory_gain=1.5)

@njit(cache=True)
def advance(steps,dt,indptr,indices,weights,v,syn,adapt,ref,ring,counts,ext_idx,ext_hz,rng,slot):
    dm=math.exp(-dt/20.); ds=math.exp(-dt/5.5); da=math.exp(-dt/500.)
    refractory=max(1,int(round(2.2/dt)))
    pending=np.empty(v.size,np.int32)
    for step in range(steps):
        # Sparse external Poisson-like membrane pulses. Only input cells are driven.
        for j in range(ext_idx.size):
            rng=(rng*1664525+1013904223)&0xffffffff
            if rng/4294967296. < ext_hz*dt*.001:
                i=ext_idx[j]
                if ref[i]==0: v[i]+=12.
        fired=0
        for i in range(v.size):
            syn[i]=syn[i]*ds+ring[slot,i]
            ring[slot,i]=0.
            adapt[i]*=da
            if ref[i]>0:
                ref[i]-=1;v[i]=-52.
            else:
                vinf=-52.+syn[i]-adapt[i]
                v[i]=vinf+(v[i]-vinf)*dm
                if v[i]>=-45.:
                    v[i]=-52.;ref[i]=refractory;adapt[i]+=8.
                    counts[i]+=1;pending[fired]=i;fired+=1
        # The slot just consumed is reused: delivery follows one full delay ring.
        for k in range(fired):
            i=pending[k]
            for edge in range(indptr[i],indptr[i+1]):
                ring[slot,indices[edge]]+=weights[edge]
        slot=(slot+1)%ring.shape[0]
    return rng,slot

class WholeBrain:
    def __init__(self,graph,dt=1.,seed=42):
        self.dt=dt;self.indptr=graph['indptr'];self.indices=graph['indices']
        self.n=len(self.indptr)-1;self.rng=seed;self.slot=0
        # Calibrate the peak of a single exponential synaptic impulse at this dt.
        dm=math.exp(-dt/20);ds=math.exp(-dt/5.5);u=1.;v=0.;peak=0.
        for _ in range(int(200/dt)):
            v=u+(v-u)*dm;u*=ds;peak=max(peak,v)
        scale=.275/peak
        self.weights=graph['weights'].astype(np.float32)*scale
        self.weights[self.weights<0]*=1.5
        self.v=np.full(self.n,-52.,np.float32);self.syn=np.zeros(self.n,np.float32)
        self.adapt=np.zeros(self.n,np.float32);self.ref=np.zeros(self.n,np.int32)
        self.ring=np.zeros((max(1,int(round(1.8/dt))),self.n),np.float32)
        self.counts=np.zeros(self.n,np.int64)

    def run(self,seconds,ext_idx,ext_hz):
        self.rng,self.slot=advance(round(seconds*1000/self.dt),self.dt,self.indptr,self.indices,self.weights,
            self.v,self.syn,self.adapt,self.ref,self.ring,self.counts,ext_idx,float(ext_hz),self.rng,self.slot)
