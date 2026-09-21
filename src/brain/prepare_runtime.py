"""Actual neuron-ID groups and eye-column mapping for the paired full graph."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'data/whole-brain'

def main():
    with np.load(DATA/'connectome.npz') as z: ids=z['root_ids'];ptr=z['indptr'];post=z['indices'];weights=z['weights']
    index={int(v):i for i,v in enumerate(ids)}
    cls=pd.read_csv(DATA/'raw/classification.csv.gz',dtype={'root_id':'uint64'}).set_index('root_id').reindex(ids).fillna('')
    types=pd.read_csv(DATA/'raw/consolidated_cell_types.csv.gz',dtype={'root_id':'uint64'}).set_index('root_id').reindex(ids).fillna('')
    arrays={}
    for role,names in {'lc4':['LC4'],'lplc2':['LPLC2'],'gf':['DNp01'],'dnp09':['DNp09'],'dng11':['DNg11'],
                       'dna02':['DNa02'],'dna01':['DNa01'],'mdn':['MDN']}.items():
        mask=types.primary_type.isin(names).to_numpy()
        arrays['group_'+role]=np.flatnonzero(mask).astype(np.int32)
        for side in ['left','right']:
            arrays['group_'+role+':'+side]=np.flatnonzero(mask & cls.side.eq(side).to_numpy()).astype(np.int32)
    arrays['group_central']=np.flatnonzero(cls.super_class.eq('central')).astype(np.int32)
    table=pd.read_csv(DATA/'raw/column_assignment.csv.gz',dtype={'root_id':'uint64'})
    mapped={};lamina={}
    for eye,offset in [('left',0),('right',63)]:
        rows=table[table.hemisphere.eq(eye)]
        x=rows.p.to_numpy()+rows.q.to_numpy()*.5;y=rows.q.to_numpy()*np.sqrt(3)/2
        cols=np.clip(np.rint((x-x.min())/(x.max()-x.min())*8),0,8).astype(int)
        lines=np.clip(np.rint((y-y.min())/(y.max()-y.min())*6),0,6).astype(int)
        for root_id,kind,bin_id in zip(rows.root_id,rows.type,offset+lines*9+cols):
            i=index.get(int(root_id))
            if i is None:continue
            if kind in ['R7','R8']:mapped[i]=int(bin_id)
            if kind in ['L1','L2','L3']:lamina[i]=int(bin_id)
    for i in np.flatnonzero(types.primary_type.eq('R1-6')):
        strongest=0;which=None
        for k in range(ptr[i],ptr[i+1]):
            if int(post[k]) in lamina and abs(weights[k])>strongest:
                strongest=abs(weights[k]);which=lamina[int(post[k])]
        if which is not None:mapped[int(i)]=which
    arrays['retina_idx']=np.array(list(mapped),np.int32);arrays['retina_bin']=np.array(list(mapped.values()),np.int32)
    probe=json.loads((ROOT/'data/circuit.json').read_text())
    arrays['probe_idx']=np.array([index.get(int(n['id']),-1) for n in probe['neurons']],np.int32)
    np.savez(DATA/'runtime-map.npz',**arrays)
    meta={'retina_mapped':len(mapped),'sample_bins':126,'mapped_probes':int((arrays['probe_idx']>=0).sum()),
          'groups':{k[6:]:len(v) for k,v in arrays.items() if k.startswith('group_')},
          'mapping':'R7/R8 by published eye column; R1-6 by strongest mapped L1/L2/L3 connection; coarse 9x7 screen bins per eye',
          'column_source':'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/column_assignment.csv.gz'}
    (DATA/'runtime-map.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print(json.dumps(meta),flush=True)
if __name__=='__main__':main()
