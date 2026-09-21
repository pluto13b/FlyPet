"""Frozen official vision features for the small image collection."""
from pathlib import Path
import sys,json,time
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];DATA=ROOT/'data/food-association-pilot';OUT=ROOT/'output/visual-learning/category'
OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'src/vision'))
from official_model import torch,flyvis,load_model
from flyvis.datasets.rendering import BoxEye
records=[r for r in json.loads((DATA/'category-dataset.json').read_text())['records'] if r['split']!='excluded']
start=time.perf_counter();model=load_model();eye=BoxEye(extent=15,kernel_size=13)
idx=np.flatnonzero(model.connectome.nodes.type[:].astype(str)=='Tm3');features=[]
with torch.inference_mode():
    initial=model.steady_state(1.,.02,1)
    for i,r in enumerate(records):
        im=Image.open(DATA/r['file']).convert('RGB');im.thumbnail((403,403))
        sq=Image.new('RGB',(403,403),(128,128,128));sq.paste(im,((403-im.width)//2,(403-im.height)//2))
        rgb=np.asarray(sq,dtype=np.float32)/255;gray=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
        retina=eye(torch.as_tensor(gray,device=flyvis.device)[None,None])
        states=model.simulate(retina.repeat(1,5,1,1),.02,initial_state=initial,as_states=True)
        v=states[-1].nodes.activity[0,idx].cpu().numpy().copy();v-=v.mean();v/=max(np.linalg.norm(v),1e-12);features.append(v)
        if (i+1)%30==0:print('Encoded',i+1,'/',len(records),flush=True)
np.savez_compressed(OUT/'features.npz',features=features,ids=[r['id'] for r in records],labels=[r['label'] for r in records],splits=[r['split'] for r in records])
(OUT/'feature-timing.json').write_text(json.dumps({'seconds':time.perf_counter()-start,'images':len(records)}))
print('Feature extraction complete',time.perf_counter()-start,flush=True)
