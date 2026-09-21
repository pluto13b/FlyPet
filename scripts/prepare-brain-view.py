"""All supplied representative coordinates, using DesktopFly's coordinate transform."""
from pathlib import Path
import csv,gzip,json
import numpy as np
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'data/brain-view'
coordinates={}
with gzip.open(out/'coordinates.csv.gz','rt',encoding='utf-8') as f:
    for row in csv.DictReader(f):
        rid=row['root_id']
        if rid not in coordinates:coordinates[rid]=[float(x) for x in row['position'].strip('[]').split()]
with gzip.open(ROOT/'data/whole-brain/raw/classification.csv.gz','rt',encoding='utf-8') as f:
    classified={row['root_id'] for row in csv.DictReader(f)}
all_points=np.array(list(coordinates.values()),dtype=np.float64)
center=(all_points.min(0)+all_points.max(0))/2;scale=20/np.ptp(all_points,axis=0).max()
ids=sorted(rid for rid in coordinates if rid in classified)
points=np.array([coordinates[rid] for rid in ids]);points=(points-center)*scale;points[:,1:]*=-1
points.astype('<f4').tofile(out/'positions.f32')
index={rid:i for i,rid in enumerate(ids)}
graph=json.loads((ROOT/'data/circuit.json').read_text())
mapped=[];errors=[]
for node in graph['neurons']:
    i=index.get(node['id'],-1);mapped.append(i)
    if i>=0:errors.append(float(np.max(np.abs(points[i]-node['pos']))))
meta={'count':len(ids),'source':'FlyWire Codex FAFB v783 coordinates.csv + classification.csv',
      'coordinate_kind':'first supplied representative position per root ID; not neurite/synapse morphology',
      'classes_source':'data/whole-brain/raw/classification.csv.gz','probe_count':len(mapped),
      'mapped_probes':sum(i>=0 for i in mapped),'max_probe_coordinate_error':max(errors),
      'upstream_transform':'DenisSergeevitch/desktop-fly etl.py @ 32b00011e83c3dc85fa3ea0b3934155b04f1635d',
      'center_nm':center.tolist(),'scale':scale,'bounds':[points.min(0).tolist(),points.max(0).tolist()]}
assert meta['mapped_probes']==668
assert meta['max_probe_coordinate_error']<.002
(out/'metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta),flush=True)
