"""Per-pet visual value memory. Observation is frozen; actual intake enables author DPR updates."""
from pathlib import Path
import sys,types
import numpy as np
ROOT=Path(__file__).resolve().parents[2]

def frozen(k,v,d,w,eta,rest):return w.copy()

class ValueReadout:
    def __init__(self):
        package=types.ModuleType('incentive')
        package.__path__=[str(ROOT/'research/learning/InsectRobotics__IncentiveCircuit/upstream/src/incentive')]
        sys.modules.setdefault('incentive',package)
        from incentive.circuit import IncentiveCircuit
        path=ROOT/'data/visual-value/memory.npz'
        with np.load(path,allow_pickle=False) as z:
            self.weights=z['weights'].copy();self.projections=z['projection'].copy();self.seeds=z['seeds'].copy()
        self.models=[IncentiveCircuit(nb_pn=721,nb_kc=200,nb_active_kcs=20,nb_trials=1,nb_timesteps=3,learning_rule=frozen) for _ in self.seeds]
        self.baselines=[m.bias.copy() for m in self.models]
        self.updates=0;self.last_key=None;self.last_change=0.;self.last_delta=0.

    def score(self,features):
        results=[]
        for feature in features:
            v=feature-feature.mean();v=v/max(np.linalg.norm(v),1e-12)
            values=[]
            for i,m in enumerate(self.models):
                m._learning_rule=frozen
                m._v[0]=self.baselines[i];m.w_p2k=self.projections[i];m.w_k2m[0]=self.weights[i]
                m.rng=np.random.RandomState(int(self.seeds[i])+1000)
                def routine():
                    m._t=0
                    for t in range(3):
                        yield 0,t,v,np.zeros(2)
                        m._t+=1
                m(routine=routine())
                activity=m._v[m._t,6:]
                values.append(float(np.mean(activity[::2]-activity[1::2])))
            results.append(float(np.mean(values)))
        return results

    def learn(self,feature,key):
        if not key or key==self.last_key:return {'updated':False,'reason':'重复摄入事件'}
        feature=np.asarray(feature,dtype=float)
        feature=feature-feature.mean();feature/=max(np.linalg.norm(feature),1e-12)
        before=self.score([feature])[0];old=self.weights.copy()
        for i,m in enumerate(self.models):
            m._learning_rule='dpr';m._v[0]=self.baselines[i]
            m.w_p2k=self.projections[i];m.w_k2m[0]=self.weights[i]
            m.rng=np.random.RandomState(int(self.seeds[i])+1000+self.updates)
            def routine():
                m._t=0
                for t in range(3):
                    yield 0,t,feature if t else np.zeros(721),np.array([float(t==2),0.])
                    m._t+=1
            m(routine=routine());self.weights[i]=m.w_k2m[m._t].copy();m._learning_rule=frozen
        self.updates+=1;self.last_key=key
        self.last_delta=float(np.max(np.abs(self.weights-old)))
        self.last_change=self.score([feature])[0]-before
        return {'updated':True,'scoreBefore':before,'scoreAfter':before+self.last_change,**self.status()}

    def status(self):
        return {'updates':self.updates,'lastRewardKey':self.last_key,'lastWeightDelta':self.last_delta,
                'lastScoreChange':self.last_change,'kind':'IncentiveCircuit KC→MBON · 摄入事件 DPR'}

    def snapshot(self):
        return {'version':1,'weights':self.weights.tolist(),**self.status()}

    def restore(self,saved):
        if not saved:return
        weights=np.asarray(saved.get('weights'),dtype=float)
        if saved.get('version')!=1 or weights.shape!=self.weights.shape or not np.isfinite(weights).all() or np.min(weights)<0 or np.max(weights)>50:
            raise ValueError('个体视觉学习存档无效，拒绝覆盖原记忆')
        self.weights=weights.copy();self.updates=int(saved.get('updates',0))
        self.last_key=saved.get('lastRewardKey');self.last_delta=float(saved.get('lastWeightDelta',0))
        self.last_change=float(saved.get('lastScoreChange',0))
