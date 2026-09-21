from pathlib import Path
import json,time
import numpy as np
from bootstrap import ROOT,torch,flyvis,load_model
from flyvis.datasets.moving_bar import MovingEdge

out=ROOT/'output/flyvis';out.mkdir(parents=True,exist_ok=True)
model=load_model()
types=model.connectome.nodes.type[:].astype(str)
u=model.connectome.nodes.u[:];v=model.connectome.nodes.v[:]
groups=['T4a','T4b','T4c','T4d','T5a','T5b','T5c','T5d']
central={g:np.flatnonzero((types==g)&(u==0)&(v==0)) for g in groups}
stimuli=MovingEdge(offsets=[-10,11],intensities=[0,1],speeds=[19],height=80,dt=.01,
                   t_pre=.2,t_post=.2,angles=[0,90,180,270])
report={'model':'official flyvis flow/0000/000','checkpoint':'chkpts/chkpt_00000','flyvis':flyvis.__version__,
        'torch':torch.__version__,'device':str(flyvis.device),'neurons':len(types),
        'connections':len(model.connectome.edges.source_index[:]),'trained_here':False,'cases':[]}
traces=[]
with torch.inference_mode():
    state=model.steady_state(1.,.01,1)
    for i in range(len(stimuli)):
        x=stimuli[i][None]
        if x.ndim==3:x=x[:,:,None,:]
        start=time.perf_counter();response=model.simulate(x,.01,initial_state=state)
        array=response[0].cpu().numpy()
        assert np.isfinite(array).all()
        signals=np.stack([array[:,central[g]].mean(1) for g in groups],1)
        baseline=signals[:15].mean(0)
        peaks=(signals[20:]-baseline).max(0)
        row=stimuli.arg_df.iloc[i]
        case={'angle':float(row['angle']),'intensity':float(row['intensity']),'frames':len(array),
              'wall_seconds':time.perf_counter()-start,'peak_above_baseline':dict(zip(groups,map(float,peaks)))}
        report['cases'].append(case);traces.append(signals)
        print(json.dumps(case),flush=True)
    direction_variation={g:max(c['peak_above_baseline'][g] for c in report['cases'])-min(c['peak_above_baseline'][g] for c in report['cases']) for g in groups}
    assert min(direction_variation.values())>1e-4
    report['response_variation']=direction_variation
    def peak(angle,intensity,group):
        return next(c['peak_above_baseline'][group] for c in report['cases'] if c['angle']==angle and c['intensity']==intensity)
    assert peak(180,1,'T4a')>2*peak(0,1,'T4a')
    assert peak(0,1,'T4b')>2*peak(180,1,'T4b')
    assert peak(180,0,'T5a')>2*peak(180,1,'T5a')
    assert peak(0,0,'T5b')>2*peak(0,1,'T5b')
    report['checks']=['T4a/T4b opposite direction preference','T5a/T5b dark-edge preference','finite responses']
    report['passed']=True
np.savez(out/'moving-edge-responses.npz',traces=np.array(traces),groups=np.array(groups))
(out/'official-model-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Official pretrained inference validated',flush=True)
