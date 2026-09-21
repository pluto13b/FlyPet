"""Held-out screenshot, frozen seed-0 checkpoint; no training on these images."""
from pathlib import Path
import sys,json,time
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'output/visual-learning';OUT=BASE/'new-covers'
sys.path.insert(0,str(ROOT/'experiments/learning'))
from pilot import IncentiveCircuit,frozen
sys.path.insert(0,str(ROOT/'src/vision'))
from official_model import torch,flyvis,load_model
from flyvis.datasets.rendering import BoxEye

memory=np.load(BASE/'visual-memory.npz',allow_pickle=False)
def score(feature):
    m=IncentiveCircuit(nb_pn=721,nb_kc=200,nb_active_kcs=20,nb_trials=1,nb_timesteps=3,
                       learning_rule=frozen,rng=np.random.RandomState(1000))
    m.w_p2k=memory['projection'].copy();m.w_k2m[0]=memory['weights'].copy()
    def routine():
        m._t=0
        for t in range(3):
            yield 0,t,feature,np.zeros(2)
            m._t+=1
    m(routine=routine())
    assert np.array_equal(m.w_k2m[m._t],memory['weights'])
    v=m._v[m._t,6:];return float(np.mean(v[::2]-v[1::2]))

start=time.perf_counter();page=Image.open(OUT/'page.png').convert('RGB')
model=load_model();eye=BoxEye(extent=15,kernel_size=13)
idx=np.flatnonzero(model.connectome.nodes.type[:].astype(str)=='Tm3')
with torch.inference_mode():
    initial=model.steady_state(1.,.02,1)
    def encode(gray):
        retina=eye(torch.as_tensor(gray,device=flyvis.device)[None,None])
        states=model.simulate(retina.repeat(1,5,1,1),.02,initial_state=initial,as_states=True)
        v=states[-1].nodes.activity[0,idx].cpu().numpy().copy();v-=v.mean()
        return v/max(np.linalg.norm(v),1e-12)
    rows=[];features=[]
    for y in [110,389,668]:
        for x in [95,405,715,1024,1334,1643]:
            box=tuple(round(v*s) for v,s in zip((x,y,x+294,y+165),(page.width/2048,page.height/983)*2))
            im=page.crop(box);i=len(rows)+1;im.save(OUT/f'cover-{i}.png')
            rgb=np.asarray(im,dtype=np.float32)/255;mx=rgb.max(2);mn=rgb.min(2)
            sat=float(np.mean((mx-mn)/np.maximum(mx,1e-8)))
            im.thumbnail((403,403));sq=Image.new('RGB',(403,403),(128,128,128));sq.paste(im,((403-im.width)//2,(403-im.height)//2))
            rgb=np.asarray(sq,dtype=np.float32)/255
            gray=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
            # Neutral RGB with the same weighted luminance; do not use HSV desaturation,
            # which would also change this model's brightness input.
            neutral=np.repeat(gray[:,:,None],3,axis=2)
            gray_control=neutral[:,:,0]*.2126+neutral[:,:,1]*.7152+neutral[:,:,2]*.0722
            v=encode(gray);vc=encode(gray_control);a=score(v);b=score(vc);features.append(v)
            rows.append({'cover':i,'box':box,'mean_HSV_saturation':sat,'score':a,'same_luminance_desaturated_score':b,
                         'max_gray_delta':float(np.max(abs(gray-gray_control))),'score_delta':abs(a-b)})
            print(f'cover {i}: {a:.5f}, saturation {sat:.3f}',flush=True)
report={'seed':0,'new_training':False,'rows':rows,'ranking':[r['cover'] for r in sorted(rows,key=lambda r:r['score'],reverse=True)],
        'max_desaturation_score_delta':max(r['score_delta'] for r in rows),'seconds':time.perf_counter()-start,
        'boundary':'Frozen previous memory; scores are not probabilities or food recognition; equal-luminance color control at input resolution.'}
(OUT/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
np.savez_compressed(OUT/'features.npz',features=features)
cards=''.join(f'<article><img src="cover-{r["cover"]}.png"><b>封面 {r["cover"]} · 读出 {r["score"]:.3f}</b><small>平均饱和度 {r["mean_HSV_saturation"]:.2f}｜去色读出 {r["same_luminance_desaturated_score"]:.3f}</small></article>' for r in rows)
html=f'''<!doctype html><meta charset="utf-8"><title>FlyPet 新封面测试</title><style>body{{font:16px "Microsoft YaHei",sans-serif;background:#101b1c;color:#e0e9de;max-width:1300px;margin:28px auto;padding:0 20px}}p{{line-height:1.8;color:#c2cec0}}.grid{{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}}article{{padding:10px;background:#213330;border-radius:10px}}img{{width:100%}}b,small{{display:block;margin-top:9px}}small{{font-size:12px;color:#b7c8ba}}@media(max-width:1000px){{.grid{{grid-template-columns:repeat(3,1fr)}}}}</style>
<h1>新封面：沿用旧记忆，没有重新投喂</h1><p>上轮保存的种子 0 模型，对这 18 张新封面的实际读出。最高三张：{report['ranking'][:3]}。这不是食物概率，也没有驱动苍蝇爬行。</p><p>保持灰度亮度相同再去掉颜色，最大评分差异为 {report['max_desaturation_score_delta']:.2e}。当前模型读取灰度，不能据此认定偏爱高饱和度。</p><div class="grid">{cards}</div><p>按截图原顺序排列。平均饱和度仅为观察者统计，不输入模型。结果只代表一份已保存记忆的迁移反应。</p>'''
(OUT/'index.html').write_text(html,encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)
