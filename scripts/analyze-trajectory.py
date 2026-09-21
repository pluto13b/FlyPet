"""Read-only diagnosis of a recorded FlyPet trajectory; no live pet experiments."""
from pathlib import Path
import json,math,collections
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

ROOT=Path(__file__).resolve().parents[1]
latest=json.loads((ROOT/'output/behavior-monitor/latest.json').read_text(encoding='utf-8'))
source=Path(latest['directory'])
samples=[r for line in (source/'samples.jsonl').read_text(encoding='utf-8').splitlines() if (r:=json.loads(line))['type']=='sample']
summary=json.loads((source/'summary.json').read_text(encoding='utf-8'))
out=ROOT/'output/behavior-analysis'/latest['id'];out.mkdir(parents=True,exist_ok=True)
intervals=[(p,s,s['age']-p['age']) for p,s in zip(samples,samples[1:]) if s['age']>p['age'] and s['t']-p['t']<.5]
active=sum(dt for _,_,dt in intervals)
edge=lambda s:min(s['x']-s['bounds']['x'],s['y']-s['bounds']['y'],s['bounds']['x']+s['bounds']['width']-s['x'],s['bounds']['y']+s['bounds']['height']-s['y'])
modes=collections.defaultdict(lambda:{'seconds':0.,'distance':0.,'absoluteTurnRadians':0.,'signedTurnRadians':0.})
visual_modes=collections.Counter();cells=collections.Counter();motor_seconds=collections.Counter()
stationary_seconds=stationary_turn=stationary_rotating=0.
edge_seconds=0.
for p,s,dt in intervals:
    distance=math.hypot(s['x']-p['x'],s['y']-p['y'])
    turn=abs(s['heading']-p['heading'])
    modes[p['mode']]['seconds']+=dt;modes[p['mode']]['distance']+=distance;modes[p['mode']]['absoluteTurnRadians']+=turn
    modes[p['mode']]['signedTurnRadians']+=s['heading']-p['heading']
    cells[(int(p['x']//80),int(p['y']//80))]+=dt
    motor_seconds[p['motor']]+=dt
    if p['visual']['active']:visual_modes[p['mode']]+=dt
    if edge(p)<65:edge_seconds+=dt
    if p['speed']<2 and p['mode'] in ['rest','groom']:
        stationary_seconds+=dt;stationary_turn+=turn
        if turn/dt>math.radians(10):stationary_rotating+=dt

def episodes(key):
    """Complete sampled episodes, excluding initial/final clips and large sampling gaps."""
    output=[];first=samples[0];label=key(first);start=first['age'];clipped=True
    for p,s in zip(samples,samples[1:]):
        next_label=key(s)
        if next_label!=label or s['t']-p['t']>.5:
            if not clipped:output.append({'kind':label,'seconds':s['age']-start,'endAge':s['age']})
            label=next_label;start=s['age'];clipped=s['t']-p['t']>.5
    return output

bouts=episodes(lambda s:s['mode'])
near_hold={}
for mode,minimum in [('walk',1.2),('rest',.8),('groom',1.5)]:
    durations=[b['seconds'] for b in bouts if b['kind']==mode]
    near_hold[mode]={'count':len(durations),'medianSeconds':float(np.median(durations)) if durations else None,
                     'within020SecondsOfMinimum':sum(minimum-.11<=d<=minimum+.2 for d in durations),
                     'minimumSeconds':minimum,'maxSeconds':max(durations,default=0.)}
vision_bouts=[b['seconds'] for b in episodes(lambda s:s['motor']) if b['kind']=='visual-value']
intent_bouts=[b['seconds'] for b in episodes(lambda s:s['visual']['active']) if b['kind']]
for d in modes.values():d['absoluteTurnRevolutions']=d['absoluteTurnRadians']/(2*math.pi)
points=np.array([[intervals[0][0]['x'],intervals[0][0]['y']]]+[[s['x'],s['y']] for _,s,_ in intervals])
net=float(np.linalg.norm(points[-1]-points[0]))
metrics={'sourceSession':str(source),'performanceVersion':'before optimization; behavior rules unchanged in current code',
 'activeSeconds':active,'wallSeconds':summary['wallSeconds'],'pausedWallSeconds':summary['availability']['paused'],
 'modes':dict(modes),'motorSeconds':dict(motor_seconds),'nearMinimumHold':near_hold,
 'positionExtent':{'min':points.min(axis=0).tolist(),'max':points.max(axis=0).tolist()},
 'netDisplacementDIP':net,'edgeWithin65DIPSeconds':edge_seconds,'edgeShare':edge_seconds/active,
 'stationaryRestGroomSeconds':stationary_seconds,'stationaryRestGroomAbsoluteTurns':stationary_turn/(2*math.pi),
 'stationaryRestGroomRotationAbove10DegreesPerSecondSeconds':stationary_rotating,
 'visualIntentByModeSeconds':dict(visual_modes),'visualAppliedEpisodes':{'count':len(vision_bouts),'medianSeconds':float(np.median(vision_bouts)) if vision_bouts else None,'maxSeconds':max(vision_bouts,default=0.)},
 'visualIntentEpisodes':{'count':len(intent_bouts),'medianSeconds':float(np.median(intent_bouts)) if intent_bouts else None},
 'topCells':[{'xRange':[x*80,(x+1)*80],'yRange':[y*80,(y+1)*80],'seconds':duration,'share':duration/active} for (x,y),duration in cells.most_common(3)],
 'hungerRange':[min(s['hunger'] for s in samples),max(s['hunger'] for s in samples)],
 'fatigueRange':[min(s['fatigue'] for s in samples),max(s['fatigue'] for s in samples)]}
(out/'analysis.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig=plt.figure(figsize=(13,8),layout='constrained');gs=fig.add_gridspec(2,2,height_ratios=[2,1])
colors={'walk':'#278b6e','rest':'#8294a8','groom':'#9a6baa','flight':'#d77834','feeding':'#b9a128'}
ax=fig.add_subplot(gs[0,0]);zoom=fig.add_subplot(gs[0,1])
for a in [ax,zoom]:
    for mode in colors:
        segs=[[[p['x'],p['y']],[s['x'],s['y']]] for p,s,dt in intervals if p['mode']==mode and math.hypot(s['x']-p['x'],s['y']-p['y'])<230*dt+30]
        a.add_collection(LineCollection(segs,colors=colors[mode],linewidths=1.3,alpha=.8,label=mode))
    a.scatter(*points[0],c='black',s=25,zorder=5,label='start')
    a.scatter(*points[-1],facecolors='none',edgecolors='red',s=70,zorder=5,label='end')
    a.set_xlabel('Desktop x (DIP)');a.set_ylabel('Desktop y (DIP)');a.grid(alpha=.15)
b=intervals[0][0]['bounds'];ax.set_xlim(b['x'],b['x']+b['width']);ax.set_ylim(b['y']+b['height'],b['y']);ax.set_aspect('equal');ax.set_title('Full desktop: limited area visited');ax.legend(fontsize=8,loc='lower left',ncol=2)
lo=points.min(axis=0)-20;hi=points.max(axis=0)+20;zoom.set_xlim(lo[0],hi[0]);zoom.set_ylim(hi[1],lo[1]);zoom.set_aspect('equal');zoom.set_title('Local loops followed by two escapes')
x,y=cells.most_common(1)[0][0];zoom.add_patch(plt.Rectangle((x*80,y*80),80,80,fill=False,ls='--',color='black',alpha=.5))
mode_names=list(colors);timeline=fig.add_subplot(gs[1,:]);origin=intervals[0][0]['age']
for p,s,dt in intervals:
    timeline.plot([p['age']-origin,s['age']-origin],[mode_names.index(p['mode'])]*2,color=colors[p['mode']],lw=4,solid_capstyle='butt')
timeline.set_yticks(range(len(mode_names)),mode_names);timeline.set_ylim(-.5,4.5);timeline.set_xlim(0,active);timeline.set_xlabel('Active simulated seconds (paused wall time excluded)');timeline.set_title('Action switching across the active part of the recording');timeline.grid(axis='x',alpha=.15)
fig.suptitle(f'FlyPet trajectory diagnosis | {active:.1f}s active / {summary["wallSeconds"]:.0f}s recorded',fontsize=15)
fig.savefig(out/'trajectory-analysis.png',dpi=150);plt.close(fig)
print(json.dumps(metrics,ensure_ascii=False,indent=2))
