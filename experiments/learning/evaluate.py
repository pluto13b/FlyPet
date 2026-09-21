"""Bounded pilot: source protocol, controls, CUDA-memory behavior and free exploration."""
import json,time,hashlib,datetime
from pathlib import Path
import numpy as np
from pilot import ROOT,SOURCE,OUT,conditioning,probe,arena,FruitFly,IncentiveCircuit

started=time.perf_counter()
tree=json.loads((SOURCE.parent/'tree.json').read_text())
integrity={}
for name in ['LICENSE','src/incentive/circuit.py','src/incentive/models_base.py','src/incentive/routines.py','src/incentive/arena.py']:
    raw=(SOURCE/name).read_bytes()
    digest=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert digest==next(n['sha'] for n in tree['tree'] if n['path']==name),name
    integrity[name]=digest

rows=[];traces={}
for condition in ['paired','frozen','no_reward','unpaired']:
    for seed in range(32):
        model,stim,row=conditioning(seed,condition)
        row['condition']='reward_before_cue' if condition=='unpaired' else condition
        rows.append(row)
        if seed==0:traces[condition]={'activity':model._v.tolist(),'weights':model.w_k2m.tolist(),'stimuli':stim.tolist()}
original=IncentiveCircuit(rng=np.random.RandomState(0));original(reversal=True)
original_result={'after_B_shock':probe(original.w_k2m[36]),'after_reversal_to_A_shock':probe(original.w_k2m[original._t])}
print('Conditioning and original shock protocol complete.',flush=True)

memory=np.load(OUT/'gpu-trained-memory.npz',allow_pickle=False)
transfer=[];paths={}
for trained in [False,True]:
    for swapped in [False,True]:
        for seed in range(32):
            f=FruitFly(nb_steps=100,rng=np.random.RandomState(seed),gain=.05,nb_kcs=10,
                      nb_kc_odour_a=5,nb_kc_odour_b=5,nb_active_kcs=5,ltm_speed=.3)
            f.mb.rng=np.random.RandomState(seed+10000)
            if swapped:f.a_source,f.b_source=f.b_source,f.a_source
            # Author arena call carries memory from this slot into its starting slot.
            f.mb.w_k2m[-2]=memory['acquired_weights' if trained else 'initial_weights'][seed].copy()
            f(punishment=False,reward=False,noise=.5)
            post=f.xy[51:];a=np.abs(post-f.a_source);b=np.abs(post-f.b_source)
            transfer.append({'seed':seed,'trained':trained,'swapped':swapped,
                             'B_occupancy':float(np.mean(b<f.r_radius)),
                             'A_occupancy':float(np.mean(a<f.r_radius)),
                             'distance_preference_B':float(np.mean(a-b))})
            paths[f'{int(trained)}_{int(swapped)}_{seed}']={'xy':np.column_stack([f.xy.real,f.xy.imag]).tolist(),
                'A':[f.a_source.real,f.a_source.imag],'B':[f.b_source.real,f.b_source.imag]}
print('Saved CUDA memory tested in reward-free arena, both source layouts.',flush=True)

free=[]
for condition in ['paired','frozen','no_reward']:
    flies=[None]*100
    for repeat in range(10):
        for seed in range(100):
            flies[seed],row=arena(seed,condition,fly=flies[seed])
            row['repeat']=repeat+1;free.append(row)
        if repeat in [0,4,9]:print(f'Free arena: {condition}, repeat {repeat+1}/10.',flush=True)

def mean(rows,key):return float(np.mean([r[key] for r in rows]))
transfer_summary=[]
for trained in [False,True]:
    for swapped in [False,True]:
        group=[r for r in transfer if r['trained']==trained and r['swapped']==swapped]
        transfer_summary.append({'trained':trained,'swapped':swapped,'n':len(group),
            **{key:mean(group,key) for key in ['B_occupancy','A_occupancy','distance_preference_B']}})
free_summary=[]
for condition in ['paired','frozen','no_reward']:
    for repeat in [1,5,10]:
        group=[r for r in free if r['condition']==condition and r['repeat']==repeat]
        free_summary.append({'condition':condition,'repeat':repeat,'n':len(group),
            **{key:mean(group,key) for key in ['post_A_occupancy','post_B_occupancy','post_distance_preference','contact_during_reward']}})

paired=[r for r in rows if r['condition']=='paired']
checks={
    'upstream_source_unmodified':True,
    'gpu_cpu_parity':json.loads((OUT/'gpu-comparison.json').read_text())['parity_passed'],
    'B_association_all_seeds':all(r['after_B_training'][1]>r['after_B_training'][0] for r in paired),
    'frozen_no_weight_change':all(r['weight_delta']==0 for r in rows if r['condition']=='frozen'),
    'no_reward_no_A_B_preference':all(abs(r['after_B_training'][1]-r['after_B_training'][0])<1e-9 for r in rows if r['condition']=='no_reward'),
    'reversal_updates_A_value':all(r['after_reversal_to_A'][0]>r['after_B_training'][0] for r in paired),
    'complete_reversal_of_combined_readout':all(r['after_reversal_to_A'][0]>r['after_reversal_to_A'][1] for r in paired),
    'saved_GPU_memory_guides_behavior_both_layouts':all(transfer_summary[i]['B_occupancy']>transfer_summary[i-2]['B_occupancy']+.2 for i in [2,3])}
report={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_commit':tree['sha'],
    'status':'association_and_transfer_demonstrated; spontaneous_selectivity_and_full_reversal_not_ready',
    'checks':checks,'source_git_blobs':integrity,'original_shock_protocol':original_result,
    'conditioning':rows,'behavior_transfer':transfer_summary,'free_arena':free_summary,
    'wall_seconds':time.perf_counter()-started,
    'notes':['Appetitive condition uses author reversal schedule with sugar channel substituted for shock.',
             'Probe uses fresh neural state and frozen learned weights; readout averages three approach-minus-avoid pairs.',
             'Reward-before-cue is a timing diagnostic, not an independent no-association null.',
             'Transfer uses disjoint cue KC inputs (5/5), author movement and noise, no test rewards; weights loaded from CUDA NPZ.',
             'Free arena uses author YAML overlapping cue inputs (7/6), gain .05, noise .5, 100 seeds and 10 repeats.',
             'Occupancy is mean fraction of steps 51..99 within radius .3, not a success rate.',
             'This pilot does not train the live full brain, visual perception, or desktop pet.']}
(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'raw-behavior.json').write_text(json.dumps({'transfer':transfer,'free':free}),encoding='utf-8')
(OUT/'traces.json').write_text(json.dumps(traces),encoding='utf-8')
(OUT/'paths.json').write_text(json.dumps(paths),encoding='utf-8')
print(json.dumps({'checks':checks,'transfer':transfer_summary,'seconds':report['wall_seconds']},indent=2),flush=True)
