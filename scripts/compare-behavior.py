"""Read-only comparison of the two explicitly selected natural observation sessions."""
from pathlib import Path
import json,math,collections
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

ROOT=Path(__file__).resolve().parents[1]
OLD='2026-09-21T02-51-46-987Z-941b718a'
NEW='2026-09-21T15-19-52-913Z-bf0660be'
OUT=ROOT/'output/behavior-analysis'/NEW;OUT.mkdir(parents=True,exist_ok=True)
def load(session):
    folder=ROOT/'output/behavior-monitor'/session
    rows=[json.loads(line) for line in (folder/'samples.jsonl').read_text(encoding='utf-8').splitlines()]
    return rows,[r for r in rows if r['type']=='sample'],json.loads((folder/'summary.json').read_text(encoding='utf-8'))
old_rows,old,old_summary=load(OLD);new_rows,new,new_summary=load(NEW)

def bouts(samples,key):
    out=[];start=0;label=key(samples[0])
    for i,s in enumerate(samples[1:],1):
        if key(s)!=label:
            if start>0:out.append((label,s['age']-samples[start]['age'],start,i))
            start=i;label=key(s)
    return out

def metrics(samples):
    active=stationary=rotation=steady_seconds=steady_rotation=path_length=guided=walk=0.
    cells=collections.Counter();mode_seconds=collections.Counter();start_of_mode=samples[0]['age']
    first=samples[0];last=samples[-1]
    for p,s in zip(samples,samples[1:]):
        dt=max(0,s['age']-p['age'])
        if s['t']-p['t']>.5:continue
        if s['mode']!=p['mode']:start_of_mode=s['age']
        active+=dt;mode_seconds[p['mode']]+=dt
        cells[(int(p['x']//80),int(p['y']//80))]+=dt
        distance=math.hypot(s['x']-p['x'],s['y']-p['y'])
        if distance<=230*dt+30:path_length+=distance
        if p['mode']=='walk':walk+=dt
        if p['motor'] in ['visual-value','peripheral']:guided+=dt
        if dt>0 and p['mode'] in ['rest','groom'] and p['speed']<2:
            stationary+=dt;rotation+=abs(s['heading']-p['heading'])
            if s['mode']==p['mode'] and s['age']-start_of_mode>.2:
                steady_seconds+=dt;steady_rotation+=abs(s['heading']-p['heading'])
    actions=bouts(samples,lambda s:s['mode'])
    visual=bouts(samples,lambda s:s['motor'])
    durations=lambda kind:[b[1] for b in actions if b[0]==kind]
    stats=lambda a:{'count':len(a),'median':float(np.median(a)) if a else None,'max':max(a,default=None)}
    ordinary=[b[1] for b in actions if b[0] in ['walk','rest','groom']]
    return {'activeSeconds':active,'pathDIP':path_length,'visited80DIPCells':sum(v>0 for v in cells.values()),
      'topTwoCellShare':sum(v for _,v in cells.most_common(2))/active,'topCellShare':max(cells.values())/active,
      'stationarySeconds':stationary,'stationaryAbsoluteTurns':rotation/(2*math.pi),
      'stationaryMeanAbsDegreesPerSecond':math.degrees(rotation)/stationary,
      'steadyStationarySeconds':steady_seconds,'steadyMeanAbsDegreesPerSecond':math.degrees(steady_rotation)/steady_seconds,
      'modeSeconds':dict(mode_seconds),'actionBouts':{k:stats(durations(k)) for k in ['walk','rest','groom','flight','feeding']},
      'ordinaryShorterThan05Share':sum(d<.5 for d in ordinary)/len(ordinary),
      'modeChangesPerActiveMinute':len(actions)/active*60,
      'visualGuidedWalkShare':guided/walk,'visualAppliedBouts':stats([b[1] for b in visual if b[0]=='visual-value']),
      'start':[first['x'],first['y']],'end':[last['x'],last['y']]}

def goal_key(s):
    g=s.get('purpose');return (g['kind'],g['started']) if g else None
goals=[]
for key,duration,start,end in bouts(new,goal_key):
    if key is None:continue
    segment=new[start:end];end_sample=new[end];last_reason=end_sample.get('lastPurpose') or {}
    reason=last_reason.get('reason') if abs(last_reason.get('time',-100)-end_sample['age'])<.25 else None
    if reason is None and goal_key(end_sample):reason='切换到另一个目的（根据记录推断）'
    stages=collections.Counter();progress=[]
    for p,s in zip(segment,segment[1:]):
        stages[p['purpose']['phase']]+=max(0,s['age']-p['age'])
        target=p['purpose']['target'];progress.append(math.hypot(p['x']-target['x'],p['y']-target['y']))
    feeding=any(s['mode']=='feeding' and s.get('feedingActive') for s in segment)
    outcome='摄入' if feeding else '完成检查（未摄入）' if reason and '检查完成' in reason else '到达探索区域' if reason and '到达新的' in reason else reason or '未记录结束原因'
    goals.append({'kind':key[0],'startActiveSeconds':segment[0]['age']-new[0]['age'],'seconds':duration,
      'stageSeconds':dict(stages),'outcome':outcome,'hadContact':any(s['contact'] for s in segment),
      'initialDistance':progress[0] if progress else None,'finalDistance':progress[-1] if progress else None})

goal_stats={}
for kind in ['inspect','explore']:
    gs=[g for g in goals if g['kind']==kind];ds=[g['seconds'] for g in gs]
    goal_stats[kind]={'completeCount':len(gs),'medianSeconds':float(np.median(ds)) if ds else None,
      'maxSeconds':max(ds,default=None),'under2SecondsShare':sum(d<2 for d in ds)/len(ds) if ds else None,
      'outcomes':dict(collections.Counter(g['outcome'] for g in gs))}
phases=collections.Counter()
for p,s in zip(new,new[1:]):
    g=p.get('purpose')
    if g:phases[g['kind']+':'+g['phase']]+=max(0,s['age']-p['age'])
intakes=[r for r in new_rows if r['type']=='intake']
learning_change=next((s for s in new if (s.get('learning') or {}).get('updates',0)>0),None)
limit=old[-1]['age']-old[0]['age'];prefix=[s for s in new if s['age']-new[0]['age']<=limit]
result={'sessions':{'old':OLD,'new':NEW},'old':metrics(old),'new':metrics(new),'newFirstMatchedActiveWindow':metrics(prefix),
 'purpose':goal_stats,'purposePhaseSeconds':dict(phases),
 'intake':{'seconds':sum(e['seconds'] for e in intakes),'firstWallSeconds':intakes[0]['t'] if intakes else None,
           'firstActiveSeconds':intakes[0]['age']-new[0]['age'] if intakes else None,
           'hungerStart':new[0]['hunger'],'hungerEnd':new[-1]['hunger'],
           'firstMealBeforeHunger':next((p['hunger'] for p,s in zip(new,new[1:]) if s['mode']=='feeding' and p['mode']!='feeding'),None),
           'firstMealAfterHunger':next((s['hunger'] for p,s in zip(new,new[1:]) if p['mode']=='feeding' and s['mode']!='feeding'),None)},
 'learning':{'initial':new[0].get('learning'),'final':new[-1].get('learning'),
   'firstUpdateWallSeconds':learning_change['t'] if learning_change else None},
 'availability':{'old':old_summary['availability'],'new':new_summary['availability']},
 'mouse':new_summary['mouse'],
 'limitations':['Different screen content and starting positions; natural observation, not controlled causal comparison.',
 'Old session has only 304 active seconds. Matched-prefix metrics reduce duration mismatch only.',
 'New visual-guided labels include persistent region goals; legacy visual.active is a different signal.',
 'Reached/checked outcomes are engineering conditions, not proof of semantic recognition.']}
(OUT/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'purpose-episodes.json').write_text(json.dumps(goals,ensure_ascii=False,indent=2),encoding='utf-8')

plt.rcParams.update({'font.size':10,'font.family':'DejaVu Sans','axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(2,2,figsize=(13,8),layout='constrained')
colors={'walk':'#278b6e','rest':'#8294a8','groom':'#9a6baa','flight':'#d77834','feeding':'#b49c1c'}
for ax,samples,label in [(axes[0,0],old,'Before: 304 active seconds'),(axes[0,1],new,'After: 1791 active seconds')]:
    for mode,color in colors.items():
        segs=[[[a['x'],a['y']],[b['x'],b['y']]] for a,b in zip(samples,samples[1:]) if a['mode']==mode and b['age']>a['age'] and b['t']-a['t']<.5]
        ax.add_collection(LineCollection(segs,colors=color,linewidths=.9,alpha=.6,label=mode))
    ax.scatter(samples[0]['x'],samples[0]['y'],c='black',s=22,zorder=4)
    ax.scatter(samples[-1]['x'],samples[-1]['y'],facecolors='none',edgecolors='red',s=50,zorder=4)
    ax.set_xlim(0,2048);ax.set_ylim(1152,0);ax.set_aspect('equal');ax.set_xlabel('Desktop x (DIP)');ax.set_ylabel('Desktop y (DIP)');ax.set_title(label)
axes[0,0].legend(loc='lower left',fontsize=8,ncol=3)
ax=axes[1,0];x=np.array([s['age']-new[0]['age'] for s in new])/60
ax.plot(x,[s['hunger'] for s in new],color='#9d7424');ax.set_ylim(0,1.06);ax.set_xlabel('Active minutes');ax.set_ylabel('Hunger');ax.set_title('One actual intake and one value update')
if intakes:ax.axvline(result['intake']['firstActiveSeconds']/60,color='#d77834',ls='--',label='intake');ax.legend()
ax=axes[1,1]
for kind,color,y in [('inspect','#278b6e',1),('explore','#507ab4',0)]:
    spans=[[(g['startActiveSeconds']/60,y),((g['startActiveSeconds']+g['seconds'])/60,y)] for g in goals if g['kind']==kind]
    ax.add_collection(LineCollection(spans,colors=color,linewidths=6))
ax.set_xlim(0,result['new']['activeSeconds']/60);ax.set_ylim(-.5,1.5);ax.set_yticks([0,1],['explore','inspect']);ax.set_xlabel('Active minutes');ax.set_title('Purpose episodes (gaps indicate no persistent goal)')
fig.suptitle('FlyPet natural observation comparison | start = black dot, end = red ring',fontsize=14)
fig.savefig(OUT/'comparison.png',dpi=150);plt.close(fig)
print(json.dumps({k:v for k,v in result.items() if k not in ['learning','availability','mouse','limitations']},ensure_ascii=False,indent=2))
