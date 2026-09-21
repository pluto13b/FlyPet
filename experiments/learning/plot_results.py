"""Exploratory plots of saved results; no re-training."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pilot import OUT

result=json.loads((OUT/'results.json').read_text(encoding='utf-8'))
gpu=json.loads((OUT/'gpu-comparison.json').read_text())
paths=json.loads((OUT/'paths.json').read_text())
plt.rcParams.update({'font.family':'Microsoft YaHei','axes.unicode_minus':False,'font.size':11})
fig,axes=plt.subplots(2,2,figsize=(13,9),layout='constrained')
fig.suptitle('FlyPet 学习试验｜关联能学到，直接自由觅食仍不稳定',fontsize=18,fontweight='bold')
colors=['#76849b','#df9c40']
row=next(r for r in result['conditioning'] if r['condition']=='paired' and r['seed']==0)
x=np.arange(3)
values=np.array([row[k] for k in ['before','after_B_training','after_reversal_to_A']])
ax=axes[0,0]
ax.bar(x-.18,values[:,0],.36,label='气味 A',color=colors[0]);ax.bar(x+.18,values[:,1],.36,label='气味 B',color=colors[1])
ax.set_xticks(x,['训练前','B＋糖水，5 次','改为 A＋糖水，6 次'])
ax.axhline(0,color='#888',lw=.8);ax.set_ylabel('模型趋近读出（任意单位）')
ax.set_title('受控配对：形成偏好；反转尚不完全');ax.legend(frameon=False)

ax=axes[0,1];data=result['behavior_transfer']
for i,label in enumerate(['未训练','载入 GPU 学到的记忆']):
    vals=[100*data[i*2+j]['B_occupancy'] for j in range(2)]
    bars=ax.bar(np.arange(2)+(i-.5)*.36,vals,.36,label=label,color=colors[i])
    ax.bar_label(bars,fmt='%.1f%%',padding=3)
ax.set_xticks([0,1],['B 在左侧','B 换到右侧']);ax.set_ylim(0,132)
ax.set_ylabel('测试后半段在 B 附近的时间比例')
ax.set_title('无奖励行为测试：偏好跟随线索｜32 个种子');ax.legend(frameon=False,loc='upper center')

ax=axes[1,0]
for condition,color,label in [('paired','#df9c40','自由训练'),('frozen','#76849b','冻结学习')]:
    rows=[r for r in result['free_arena'] if r['condition']==condition]
    ax.plot([r['repeat'] for r in rows],[100*r['post_A_occupancy'] for r in rows],'-o',color=color,label=label+'：A')
    ax.plot([r['repeat'] for r in rows],[100*r['post_B_occupancy'] for r in rows],'--s',color=color,label=label+'：B')
ax.set_xticks([1,5,10]);ax.set_xlabel('重复轮次（每轮 100 步）');ax.set_ylabel('附近停留时间比例（%）')
ax.set_title('作者重叠气味输入：后期对 A/B 缺少选择性｜100 种子');ax.legend(frameon=False,ncol=2)

ax=axes[1,1]
for trained,label,color in [(0,'未训练','#76849b'),(1,'训练后','#df9c40')]:
    p=paths[f'{trained}_0_1'];xy=np.array(p['xy'])
    ax.plot(xy[:,0],xy[:,1],color=color,lw=1.8,label=label)
    ax.scatter(*xy[-1],color=color,s=35)
for label,position in [('A',p['A']),('B',p['B'])]:
    ax.add_patch(plt.Circle(position,.3,color='#df9c40' if label=='B' else '#76849b',alpha=.12))
    ax.text(*position,label,ha='center',va='center',fontsize=15)
ax.scatter(0,0,c='black',marker='+',label='起点')
ax.set_aspect('equal');ax.set_xlim(-1,1);ax.set_ylim(-1,1)
ax.set_title('同一随机种子 1 的轨迹｜B 曾与糖水配对');ax.legend(frameon=False,loc='lower right')
for ax in axes.flat:
    ax.spines[['top','right']].set_visible(False)
fig.savefig(OUT/'learning-results.png',dpi=150)
plt.close(fig)

html='''<!doctype html><meta charset="utf-8"><title>FlyPet 学习试验回放</title>
<style>body{background:#101b1c;color:#e1e9df;font:16px "Microsoft YaHei",sans-serif;max-width:1100px;margin:30px auto}h1{font-size:26px}p{line-height:1.7;color:#bdcbbb}button,select,input{margin:8px;padding:8px}canvas{width:100%;background:#162629;border-radius:16px}.note{font-size:14px}</style>
<h1>同样的环境，投喂经历改变了选择</h1>
<p>左：未训练　右：载入 GPU 学到的 B 气味记忆。两边使用相同随机种子；测试期间没有糖水奖励。播放的是已保存轨迹，不是动画脚本生成的选择。</p>
<button id="play">暂停</button><button id="reset">重放</button><label>种子 <select id="seed"></select></label><label><input type="checkbox" id="swap">交换 A/B 位置</label><span id="time"></span>
<canvas id="canvas" width="1100" height="510"></canvas><input id="step" type="range" min="0" max="99" value="0" style="width:95%">
<p class="note">圆圈是虚拟气味源的附近范围。橙色 B 曾与糖水配对。这是简化气味学习与作者运动接口的独立试验，尚未接入桌面苍蝇，也不是视觉食物识别。32 个种子的统计及自由训练未达标结果见 learning-results.png / results.json。</p>
<script>const paths=__PATHS__;const c=document.getElementById('canvas'),ctx=c.getContext('2d'),seed=document.getElementById('seed'),swap=document.getElementById('swap'),slider=document.getElementById('step'),play=document.getElementById('play');let t=0,playing=true;
for(let i=0;i<32;i++){let o=document.createElement('option');o.value=i;o.textContent=i;seed.append(o)}seed.value=1;
function draw(){ctx.clearRect(0,0,1100,510);for(let k=0;k<2;k++){const p=paths[`${k}_${Number(swap.checked)}_${seed.value}`],cx=275+k*550,cy=260,scale=205;ctx.strokeStyle='#4b6062';ctx.beginPath();ctx.arc(cx,cy,scale,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e1e9df';ctx.font='18px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(k?'训练后':'未训练',cx,28);for(const name of ['A','B']){const q=p[name];ctx.fillStyle=name==='B'?'#df9c4038':'#8a99b038';ctx.beginPath();ctx.arc(cx+q[0]*scale,cy-q[1]*scale,.3*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle=name==='B'?'#df9c40':'#a6b4ce';ctx.fillText(name,cx+q[0]*scale,cy-q[1]*scale+6)}ctx.strokeStyle=k?'#df9c40':'#a6b4ce';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<=t;i++){let q=p.xy[i];i?ctx.lineTo(cx+q[0]*scale,cy-q[1]*scale):ctx.moveTo(cx+q[0]*scale,cy-q[1]*scale)}ctx.stroke();let q=p.xy[t];ctx.fillStyle=k?'#df9c40':'#a6b4ce';ctx.beginPath();ctx.arc(cx+q[0]*scale,cy-q[1]*scale,6,0,Math.PI*2);ctx.fill()}document.getElementById('time').textContent=`第 ${t}/99 步`;slider.value=t}
function reset(){t=0;playing=true;play.textContent='暂停';draw()}play.onclick=()=>{playing=!playing;play.textContent=playing?'暂停':'播放'};document.getElementById('reset').onclick=reset;seed.onchange=reset;swap.onchange=reset;slider.oninput=()=>{t=Number(slider.value);playing=false;play.textContent='播放';draw()};setInterval(()=>{if(playing){if(t<99)t++;else{playing=false;play.textContent='播放'}draw()}},100);draw();</script>'''
(OUT/'replay.html').write_text(html.replace('__PATHS__',json.dumps(paths)),encoding='utf-8')
print('Saved learning-results.png and replay.html')
