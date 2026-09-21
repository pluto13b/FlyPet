"""Run the author's IncentiveCircuit unchanged; separate experiments from the pet."""
from pathlib import Path
import sys,types,json,time,hashlib
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'research/learning/InsectRobotics__IncentiveCircuit/upstream'
OUT=ROOT/'output/learning-pilot'
OUT.mkdir(parents=True,exist_ok=True)
# Load only the model modules, avoiding upstream __init__'s optional plotting/data imports.
package=types.ModuleType('incentive');package.__path__=[str(SOURCE/'src/incentive')]
sys.modules['incentive']=package
from incentive.circuit import IncentiveCircuit
from incentive.routines import reversal_routine
from incentive.arena import FruitFly

def frozen(k,v,d,w,eta,rest):return w.copy()

def probe(weights,seed=123):
    scores=[]
    for cs in ([1.,0.],[0.,1.]):
        model=IncentiveCircuit(nb_trials=1,nb_timesteps=3,rng=np.random.RandomState(seed),learning_rule=frozen)
        model.w_k2m[0]=weights.copy()
        def routine():
            model._t=0
            for i in range(3):
                yield 0,i,np.array(cs),np.zeros(2)
                model._t+=1
        model(routine=routine())
        v=model._v[model._t,6:]
        scores.append(float(np.mean(v[::2]-v[1::2])))
    return scores

def conditioning(seed=0,condition='paired'):
    model=IncentiveCircuit(rng=np.random.RandomState(seed),learning_rule=frozen if condition=='frozen' else 'dpr')
    stimuli=[]
    def routine():
        for trial,step,cs,us in reversal_routine(model):
            # Author reversal schedule, sugar channel instead of shock for product-relevant pilot.
            reward=us[::-1].copy()
            if condition=='no_reward':reward[:]=0
            if condition=='unpaired':
                trial_index=model._t//model.nb_timesteps
                reward=np.array([float(trial_index in [3,5,7,9,11,14,16,18,20,22,24] and step==0),0.])
            stimuli.append([*cs,*reward])
            yield trial,step,cs,reward
    started=time.perf_counter();model(routine=routine());wall=time.perf_counter()-started
    return model,np.array(stimuli),{
        'seed':seed,'condition':condition,'seconds':wall,
        'before':probe(model.w_k2m[0]),'after_B_training':probe(model.w_k2m[36]),
        'after_reversal_to_A':probe(model.w_k2m[model._t]),
        'weight_delta':float(np.max(np.abs(model.w_k2m[model._t]-model.w_k2m[0])))}

def arena(seed=0,condition='paired',steps=100,fly=None):
    if fly is None:
        # Published example's YAML and create_arena_paths.py settings.
        fly=FruitFly(nb_steps=steps,rng=np.random.RandomState(seed),gain=.05,
                     nb_kcs=10,nb_kc_odour_a=7,nb_kc_odour_b=6,nb_active_kcs=5,ltm_speed=.3)
        fly.mb.rng=np.random.RandomState(seed+10000)
    if condition=='frozen':fly.mb._learning_rule=frozen
    fly(punishment=False,reward=condition!='no_reward',only_a=True,noise=.5)
    xy=fly.xy[:fly.t+1]
    post=xy[51:]
    a=np.abs(post-fly.a_source);b=np.abs(post-fly.b_source)
    result={'seed':seed,'condition':condition,
        'post_A_occupancy':float(np.mean(a<fly.r_radius)),
        'post_B_occupancy':float(np.mean(b<fly.r_radius)),
        'post_distance_preference':float(np.mean(b-a)),
        'contact_during_reward':bool(np.any(np.abs(xy[21:51]-fly.a_source)<fly.r_radius))}
    return fly,result

if __name__=='__main__':
    for condition in ['paired','frozen','no_reward','unpaired']:
        model,stim,row=conditioning(condition=condition);print(json.dumps(row))
    for condition in ['paired','frozen','no_reward']:
        fly,row=arena(condition=condition);print(json.dumps(row))
