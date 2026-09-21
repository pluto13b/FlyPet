. "$PSScriptRoot/env.ps1"
$env:PYTHONPYCACHEPREFIX = Join-Path $FlyPetRoot '.cache/pycache'
$env:NUMBA_CACHE_DIR = Join-Path $FlyPetRoot '.cache/numba'
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
if (!(Test-Path 'data/whole-brain/connectome.npz')) {
  & .venv-brain/Scripts/python.exe experiments/whole_brain/prepare.py
  if ($LASTEXITCODE -ne 0) { throw 'Data preparation failed' }
}
& .venv-brain/Scripts/python.exe experiments/whole_brain/benchmark.py
if ($LASTEXITCODE -ne 0) { throw 'Whole-brain benchmark failed' }
