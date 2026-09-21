"""Compile the full Shiu v783 paired release; no synapse-count threshold."""
from pathlib import Path
import json
import time
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data' / 'whole-brain'
BASE = 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/'
PAPER = 'https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/'

def main():
    start = time.perf_counter()
    cls = pd.read_csv(DATA/'raw/classification.csv.gz', dtype={'root_id': 'uint64'}).fillna('')
    types = pd.read_csv(DATA/'raw/consolidated_cell_types.csv.gz', dtype={'root_id': 'uint64'}).fillna('')
    con = pd.read_parquet(DATA/'raw/Connectivity_783.parquet',columns=['Presynaptic_ID','Postsynaptic_ID','Connectivity','Excitatory x Connectivity'])
    con = con.rename(columns={'Presynaptic_ID':'pre_root_id','Postsynaptic_ID':'post_root_id','Connectivity':'syn_count'})
    print(f'Read {len(cls):,} classified neurons and {len(con):,} rows', flush=True)
    ids = np.sort(pd.read_csv(DATA/'raw/Completeness_783.csv').iloc[:,0].to_numpy(dtype=np.uint64))
    n=len(ids)
    pre=np.searchsorted(ids,con.pre_root_id.to_numpy(dtype=np.uint64)).astype(np.int64)
    post=np.searchsorted(ids,con.post_root_id.to_numpy(dtype=np.uint64)).astype(np.int64)
    count=con.syn_count.to_numpy(dtype=np.int64)
    supplied_signed=con['Excitatory x Connectivity'].to_numpy(dtype=np.float32)
    assert np.array_equal(ids[pre],con.pre_root_id) and np.array_equal(ids[post],con.post_root_id)
    key=pre*n+post
    order=np.argsort(key,kind='stable')
    key=key[order]
    starts=np.r_[0,np.flatnonzero(np.diff(key))+1]
    pair_counts=np.add.reduceat(count[order],starts)
    signed=np.add.reduceat(supplied_signed[order],starts).astype(np.float32)
    unique=key[starts]
    pre=(unique//n).astype(np.int32);post=(unique%n).astype(np.int32)
    indptr=np.r_[0,np.cumsum(np.bincount(pre,minlength=n))].astype(np.int64)
    annotations=cls.set_index('root_id').reindex(ids).fillna('')
    typed=types.drop_duplicates('root_id').set_index('root_id').reindex(ids).fillna('')
    arrays={'root_ids':ids,'indptr':indptr,'indices':post,'weights':signed,'synapse_counts':pair_counts.astype(np.int32)}
    groups={'photoreceptor':typed.primary_type.isin(['R1-6','R7','R8']),
            'LC4':typed.primary_type.eq('LC4'),'LPLC2':typed.primary_type.eq('LPLC2'),
            'GF':typed.primary_type.eq('DNp01'),'DNa02':typed.primary_type.eq('DNa02'),
            'DNp09':typed.primary_type.eq('DNp09'),'central':annotations.super_class.eq('central'),
            'descending':annotations.super_class.eq('descending')}
    arrays.update({f'pop_{name}':np.flatnonzero(mask).astype(np.int32) for name,mask in groups.items()})
    # Uncompressed arrays load rapidly; all data remains in the workspace.
    np.savez(DATA/'connectome.npz',**arrays)
    meta={'dataset':'Shiu Drosophila_brain_model full paired FAFB v783 release','source_base':PAPER,
          'neurons':n,'classification_table_neurons':len(cls),'unclassified_endpoints':int(len(np.setdiff1d(ids,cls.root_id))),
          'classification_neurons_absent_from_paired_release':int(len(np.setdiff1d(cls.root_id,ids))),
          'input_connection_rows':len(con),'connections':len(post),'synaptic_contacts':int(count.sum()),
          'minimum_synapses':1,'dropped_connection_rows':0,
          'zero_signed_connections':int((signed==0).sum()),'array_bytes':sum(a.nbytes for a in arrays.values()),
          'populations':{k:int(v.sum()) for k,v in groups.items()},'prepare_seconds':time.perf_counter()-start,
          'sign_model':'preserve supplied Excitatory x Connectivity; no local transmitter sign override',
          'files':[{ 'name':p.name,'bytes':p.stat().st_size,'url':(PAPER if p.suffix in ['.parquet','.csv'] else BASE)+p.name } for p in (DATA/'raw').iterdir()]}
    assert int(pair_counts.sum())==int(count.sum())
    assert indptr[-1]==len(post) and np.all(post>=0) and np.all(post<n)
    (DATA/'metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print(json.dumps(meta,indent=2),flush=True)

if __name__=='__main__': main()
