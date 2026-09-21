"""Read-only audit of current photoreceptor signs and available column annotations."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
root=Path(__file__).resolve().parents[2]
p=root/'data/whole-brain'
with np.load(p/'connectome.npz') as z:
    ids=z['root_ids'];ptr=z['indptr'];weights=z['weights']
types=pd.read_csv(p/'raw/consolidated_cell_types.csv.gz',dtype={'root_id':'uint64'}).set_index('root_id').reindex(ids).fillna('')
photo=np.flatnonzero(types.primary_type.isin(['R1-6','R7','R8']))
positive=negative=0;positive_weight=negative_weight=0.
for i in photo:
    w=weights[ptr[i]:ptr[i+1]]
    positive+=int((w>0).sum());negative+=int((w<0).sum())
    positive_weight+=float(w[w>0].sum());negative_weight-=float(w[w<0].sum())
columns=pd.read_csv(p/'raw/column_assignment.csv.gz')
result={'photoreceptors_in_paired_brain':len(photo),'photo_outgoing_positive_edges':positive,
        'photo_outgoing_negative_edges':negative,'positive_edge_fraction':positive/(positive+negative),
        'positive_absolute_weight_fraction':positive_weight/(positive_weight+negative_weight),
        'eye_columns':{str(k):int(v.column_id.nunique()) for k,v in columns.groupby('hemisphere')},
        'color_type_labels':[str(v) for v in sorted(set(types.primary_type)) if str(v).startswith(('R7','R8'))]}
(root/'research/vision/current-visual-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
