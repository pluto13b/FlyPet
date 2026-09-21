# SPDX-License-Identifier: GPL-3.0-or-later
# Experimental torch translation of IncentiveCircuit by Evripidis Gkanias.
# Upstream license: research/learning/InsectRobotics__IncentiveCircuit/upstream/LICENSE
"""Four GPU memories, a small fixed epoch choice, and one final held-out evaluation."""
from pathlib import Path
import sys,json,time,shutil
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/visual-learning/category';DATA=ROOT/'data/food-association-pilot'
sys.path.insert(0,str(ROOT/'experiments/learning'))
from pilot import IncentiveCircuit
assert torch.cuda.is_available(),'Use the existing tudui Conda CUDA environment.'
z=np.load(OUT/'features.npz',allow_pickle=False);features=z['features'];labels=z['labels'];splits=z['splits'];ids=z['ids']
dtype=torch.float64;device='cuda';batch=4
def T(a):return torch.as_tensor(a,dtype=dtype,device=device)
base=IncentiveCircuit(nb_pn=721,nb_kc=200,nb_active_kcs=20,nb_trials=1,nb_timesteps=3)
projection=np.stack([np.random.RandomState(s).normal(0,.12,(721,200)) for s in range(batch)])
proj=T(projection);bias=T(base.bias.copy());rest=T(base.w_rest.copy())
m2v=T(base.w_m2v);d2k=T(base.w_d2k);u2d=T(base.w_u2d)
w=T(np.repeat(base.w_k2m[0][None],batch,axis=0));v=T(np.repeat(base._v[0][None],batch,axis=0))
fv=T(features);eta=(1/3)**(1/3);rngs=[np.random.RandomState(s+1000) for s in range(batch)]

def update(feature,us,noise):
    global w,v
    k=torch.einsum('f,bfk->bk',feature,proj)+T(noise)*.001
    k=k.scatter(1,torch.argsort(k,dim=1)[:,:-20],0.)
    mb=torch.clamp(torch.einsum('bk,bkj->bj',k,w)+T(us)@u2d+bias,-100,100)
    vp=v.clone();wp=w.clone()
    for _ in range(4):
        vo=torch.clamp(vp+eta*(mb@m2v-2*vp),0,2)
        D=vo@d2k
        wo=torch.clamp(wp+.5*D[:,None,:]*(k[:,:,None]+wp-rest),0,50)
        vp=vp+.25*(vo-vp);wp=wp+.25*(wo-wp)
    v=vo;w=wo

def evaluate(weights,indices):
    inputs=fv[indices];n=len(indices)
    state=bias[None,None,:].expand(batch,n,12).clone()
    noise=T(np.stack([np.random.RandomState(s+1000).rand(3,200) for s in range(batch)]))
    for step in range(3):
        k=torch.einsum('nf,bfk->bnk',inputs,proj)+noise[:,step,None,:]*.001
        k=k.scatter(2,torch.argsort(k,dim=2)[:,:,:-20],0.)
        mb=torch.clamp(torch.einsum('bnk,bkj->bnj',k,weights)+bias,-100,100)
        vp=state.clone()
        for _ in range(4):
            vo=torch.clamp(vp+eta*(mb@m2v-2*vp),0,2);vp=vp+.25*(vo-vp)
        state=vo
    a=state[:,:,6:];return (a[:,:,::2]-a[:,:,1::2]).mean(2).cpu().numpy()

def auc(y,s):
    diff=s[y==1][:,None]-s[y==0][None,:]
    return float(np.mean((diff>0)+.5*(diff==0)))

positive=np.flatnonzero((splits=='train')&(labels==1));negative=np.flatnonzero((splits=='train')&(labels==0))
val=np.flatnonzero(splits=='validation');order_rng=np.random.RandomState(2026)
history=[];snapshots={};parity=None
torch.cuda.synchronize();start=time.perf_counter()
with torch.inference_mode():
    for epoch in range(1,6):
        pos=order_rng.permutation(positive);neg=np.resize(order_rng.permutation(negative),len(pos))
        order=np.column_stack([pos,neg]).ravel()
        for trial,i in enumerate(order):
            for step in range(3):
                update(fv[i] if step else torch.zeros(721,device=device,dtype=dtype),
                       [float(labels[i]==1 and step==2),0.],np.stack([r.rand(200) for r in rngs]))
            if epoch==1 and trial==0:
                # Check the translated update before proceeding with the experiment.
                m=IncentiveCircuit(nb_pn=721,nb_kc=200,nb_active_kcs=20,nb_trials=1,nb_timesteps=3,rng=np.random.RandomState(1000))
                m.w_p2k=projection[0].copy()
                def routine():
                    m._t=0
                    for t in range(3):
                        yield 0,t,features[i] if t else np.zeros(721),np.array([float(labels[i]==1 and t==2),0.])
                        m._t+=1
                m(routine=routine())
                parity=max(float(np.max(abs(m.w_k2m[3]-w[0].cpu().numpy()))),float(np.max(abs(m._v[3]-v[0].cpu().numpy()))))
                assert parity<1e-9,parity
        if epoch in [1,3,5]:
            scores=evaluate(w,val).mean(0);metric=auc(labels[val],scores)
            history.append({'epoch':epoch,'validation_auc':metric});snapshots[epoch]=w.clone()
            print('epoch',epoch,'validation AUC',round(metric,4),flush=True)
    chosen=max(history,key=lambda r:(r['validation_auc'],-r['epoch']))['epoch']
    selected=snapshots[chosen]
    # Training settings are now fixed. Test labels are used only below for reporting.
    all_scores=evaluate(selected,np.arange(len(ids)))
torch.cuda.synchronize();wall=time.perf_counter()-start
means=all_scores.mean(0);metrics={}
for split in ['train','validation','test']:
    idx=np.flatnonzero(splits==split);y=labels[idx];s=means[idx]
    metrics[split]={'food':int(np.sum(y==1)),'nonfood':int(np.sum(y==0)),'auc':auc(y,s),
                    'food_mean':float(s[y==1].mean()),'nonfood_mean':float(s[y==0].mean())}
rows=[{'id':str(ids[i]),'label':int(labels[i]),'split':str(splits[i]),'score':float(means[i]),
       'seed_scores':all_scores[:,i].tolist()} for i in range(len(ids))]
report={'chosen_epoch':chosen,'validation_history':history,'metrics':metrics,'rows':rows,'gpu':torch.cuda.get_device_name(0),
        'torch':torch.__version__,'seconds':wall,'seeds':[0,1,2,3],'cpu_gpu_update_error':parity,
        'note':'Fresh memory; pretrained vision fixed. Food sugar reward, nonfood no reward. Source style differs; no claim of general food semantics.'}
(OUT/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
np.savez_compressed(OUT/'trained-memory.npz',weights=selected.cpu().numpy(),projection=projection,seeds=np.arange(batch),epoch=chosen)
print(json.dumps({k:v for k,v in report.items() if k!='rows'},indent=2),flush=True)

# A compact visual result page, ordered by actual score on unseen test images.
(OUT/'covers').mkdir(exist_ok=True)
records={r['id']:r for r in json.loads((DATA/'category-dataset.json').read_text())['records']}
cards=[]
for row in sorted([r for r in rows if r['split']=='test'],key=lambda r:r['score'],reverse=True):
    source=DATA/records[row['id']]['file'];dest=OUT/'covers'/source.name;shutil.copyfile(source,dest)
    cards.append(f'<article><img src="covers/{source.name}"><b>{"食物" if row["label"] else "非食物"} · {row["score"]:.3f}</b><small>{row["id"]}</small></article>')
table=''.join(f'<tr><td>{s}</td><td>{m["food"]}/{m["nonfood"]}</td><td>{m["auc"]:.3f}</td><td>{m["food_mean"]:.3f}</td><td>{m["nonfood_mean"]:.3f}</td></tr>' for s,m in metrics.items())
html=f'''<!doctype html><meta charset="utf-8"><title>FlyPet 食物关联训练</title><style>body{{font:16px "Microsoft YaHei",sans-serif;background:#101b1c;color:#e0e9de;max-width:1250px;margin:30px auto;padding:0 20px}}p{{line-height:1.8;color:#bdcebc}}table{{border-collapse:collapse;width:100%}}td,th{{padding:10px;border-bottom:1px solid #3b5048;text-align:left}}.grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}}article{{background:#20332d;padding:9px;border-radius:8px}}img{{width:100%}}b,small{{display:block;margin-top:8px}}@media(max-width:950px){{.grid{{grid-template-columns:repeat(3,1fr)}}}}</style>
<h1>食物给奖励：这一轮学到了多少？</h1><p>4 个模型在 RTX 4060 上训练。验证集选中第 {chosen} 轮，测试图片未给过奖励。AUC 表示随机抽一张食物和一张非食物时，食物得分更高的比例（平局计一半）；0.5 相当于随机排序，不是分类准确率。</p><table><tr><th>集合</th><th>食物/非食物</th><th>AUC</th><th>食物平均读出</th><th>非食物平均读出</th></tr>{table}</table><p>GPU 训练与评分约 {wall:.1f} 秒。视觉模型不变，只更新学习回路；页面风格存在差异，不能把成绩当成已理解所有食物。正式苍蝇尚未接入。</p><h2>测试集：按模型评分从高到低</h2><div class="grid">{''.join(cards)}</div>'''
(OUT/'index.html').write_text(html,encoding='utf-8')
