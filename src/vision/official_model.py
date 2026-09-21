"""Workspace setup plus a Windows-only HDF5 cache write fix; model math is untouched."""
from pathlib import Path
import os
ROOT=Path(__file__).resolve().parents[2]
for key,relative in {'FLYVIS_ROOT_DIR':'data/flyvis','MPLCONFIGDIR':'.cache/matplotlib','TORCH_HOME':'.cache/torch',
                     'NUMBA_CACHE_DIR':'.cache/numba-vision','CUDA_CACHE_PATH':'.cache/cuda'}.items():
    os.environ[key]=str(ROOT/relative)
os.environ.setdefault('OMP_NUM_THREADS','4')
os.environ.setdefault('OPENBLAS_NUM_THREADS','4')

import numpy as np
import h5py
import datamate.io
import datamate.directory
def write_array(path,val):
    # Upstream 1.0 opens with 'w', then tries to unlink that open HDF5 on Windows.
    # Write the identical 'data' dataset using a context manager instead.
    path.parent.mkdir(parents=True,exist_ok=True)
    with h5py.File(path,libver='latest',mode='w') as handle:
        handle['data']=np.asarray(val)
        handle.swmr_mode=True
if os.name=='nt':
    datamate.io._write_h5=write_array
    datamate.directory._write_h5=write_array

import torch
torch.set_num_threads(4)
import flyvis

def load_model():
    view=flyvis.NetworkView(flyvis.results_dir/'flow/0000/000')
    model=view.init_network()
    model.eval()
    for parameter in model.parameters():parameter.requires_grad_(False)
    return model
