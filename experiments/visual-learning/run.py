"""Pixel-based cue association pilot. No food labels enter sensory encoding."""
from pathlib import Path
import sys,json,time
import numpy as np
from PIL import Image,ImageEnhance
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/visual-learning'
sys.path.insert(0,str(ROOT/'experiments/learning'))
from pilot import IncentiveCircuit,frozen
sys.path.insert(0,str(ROOT/'src/vision'))
from official_model import torch,flyvis,load_model
from flyvis.datasets.rendering import BoxEye

started=time.perf_counter()
page=Image.open(OUT/'page.png').convert('RGB')
xs=[95,405,715,1024,1334,1643];ys=[310,589];boxes=[];images=[]
for y in ys:
    for x in xs:
        box=tuple(round(v*s) for v,s in zip((x,y,x+294,y+165),(page.width/2048,page.height/983,page.width/2048,page.height/983)));boxes.append(box)
        im=page.crop(box);im.save(OUT/f'cover-{len(images)+1}.png');images.append(im)
A,B=3,5
cache=OUT/'visual-features.npz'
if not cache.exists() or not np.array_equal(np.load(cache)['boxes'],boxes):
    model=load_model();eye=BoxEye(extent=15,kernel_size=13)
    types=model.connectome.nodes.type[:].astype(str);idx=np.flatnonzero(types=='Tm3')
    assert len(idx)==721
    with torch.inference_mode():
        initial=model.steady_state(1.,.02,1)
        def encode(im):
            # Same resize for every image; preserve aspect ratio on a neutral square.
            im=im.copy();im.thumbnail((403,403));square=Image.new('RGB',(403,403),(128,128,128))
            square.paste(im,((403-im.width)//2,(403-im.height)//2))
            rgb=np.asarray(square,dtype=np.float32)/255
            gray=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
            retina=eye(torch.as_tensor(gray,device=flyvis.device)[None,None])
            states=model.simulate(retina.repeat(1,5,1,1),.02,initial_state=initial,as_states=True)
            vec=states[-1].nodes.activity[0,idx].cpu().numpy().copy()
            vec=vec-vec.mean();vec=vec/max(np.linalg.norm(vec),1e-12)
            return vec
        features=np.stack([encode(im) for im in images])
        dim=np.stack([encode(ImageEnhance.Brightness(images[i]).enhance(.85)) for i in [A,B]])
    np.savez(cache,features=features,dim=dim,cell_type='Tm3',boxes=boxes)
    print('Official visual model encoded 12 actual covers and 2 brightness variants.',flush=True)
data=np.load(cache);features=data['features'];dim=data['dim']

def create(seed,rule='dpr'):
    m=IncentiveCircuit(nb_pn=721,nb_kc=200,nb_active_kcs=20,nb_trials=12,nb_timesteps=3,
                       learning_rule=rule,rng=np.random.RandomState(seed+1000))
    m.w_p2k=np.random.RandomState(seed).normal(0,.12,(721,200))
    return m

def scores(weights,seed,inputs):
    vals=[]
    for feature in inputs:
        m=create(seed,frozen);m.w_k2m[0]=weights.copy()
        def routine():
            m._t=0
            for i in range(3):
                yield 0,i,feature,np.zeros(2)
                m._t+=1
        m(routine=routine())
        v=m._v[m._t,6:];vals.append(float(np.mean(v[::2]-v[1::2])))
    return vals

def train(seed,rewarded,locked=False):
    m=create(seed,frozen if locked else 'dpr')
    def routine():
        m._t=0
        for trial in range(12):
            cue=A if trial%2==0 else B
            for step in range(3):
                cs=features[cue] if step else np.zeros(721)
                us=np.array([float(trial>=2 and cue==rewarded and step==2),0.])
                yield trial,step,cs,us
                m._t+=1
    m(routine=routine());return m

rows=[]
for seed in range(16):
    for mode,target,locked in [('reward_B',B,False),('reward_A',A,False),('frozen',B,True)]:
        m=train(seed,target,locked);w=m.w_k2m[m._t]
        vals=scores(w,seed,features);variant=scores(w,seed,dim)
        rows.append({'seed':seed,'mode':mode,'scores':vals,'dim_scores':variant})
        if seed==0 and mode=='reward_B':
            np.savez_compressed(OUT/'visual-memory.npz',weights=w,projection=m.w_p2k,
                                activity=m._v[m._t],seed=seed)

summary={}
for mode in ['reward_B','reward_A','frozen']:
    group=[r for r in rows if r['mode']==mode];v=np.array([r['scores'] for r in group]);d=np.array([r['dim_scores'] for r in group])
    summary[mode]={'mean_scores':v.mean(0).tolist(),'mean_dim_scores':d.mean(0).tolist(),
                   'B_over_A_count':int(np.sum(v[:,B]>v[:,A]+1e-9)),
                   'A_over_B_count':int(np.sum(v[:,A]>v[:,B]+1e-9)),
                   'dim_B_over_A_count':int(np.sum(d[:,1]>d[:,0]+1e-9))}
report={'n_seeds':16,'training_A_cover':A+1,'training_B_cover':B+1,'sugar_pairings':5,
        'summary':summary,'rows':rows,'seconds':time.perf_counter()-started,
        'encoding':'Fixed official flyvis Tm3 spatial response -> per-image center/L2 -> fixed random projection -> 200 KC, top 20 active',
        'boundary':'Engineered visual-to-memory interface, not anatomical wiring; no food semantics, no desktop control; fixed manually selected cover rectangles.',
        'position_test':'Same image crop is encoded identically at either slot; layout coordinates never enter input. This tests slot independence, not active localization.'}
(OUT/'results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
template=Path(__file__).with_name('page-template.html')
if template.exists():
    (OUT/'index.html').write_text(template.read_text(encoding='utf-8').replace('__DATA__',json.dumps({'summary':summary},ensure_ascii=False)),encoding='utf-8')
print(json.dumps({'summary':summary,'seconds':report['seconds']},ensure_ascii=False),flush=True)
