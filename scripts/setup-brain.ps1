. "$PSScriptRoot/env.ps1"
$env:PYTHONPYCACHEPREFIX = Join-Path $FlyPetRoot '.cache/pycache'
$env:NUMBA_CACHE_DIR = Join-Path $FlyPetRoot '.cache/numba'
if (!(Test-Path '.venv-brain/Scripts/python.exe')) { python -m venv --system-site-packages .venv-brain }
& .venv-brain/Scripts/python.exe -m pip install --proxy http://127.0.0.1:7897 -r experiments/whole_brain/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Brain environment setup failed' }
New-Item -ItemType Directory -Path 'data/whole-brain/raw','output/whole-brain' -Force | Out-Null
$files = @{
  'classification.csv.gz' = 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/classification.csv.gz'
  'consolidated_cell_types.csv.gz' = 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/consolidated_cell_types.csv.gz'
  'column_assignment.csv.gz' = 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/column_assignment.csv.gz'
  'Connectivity_783.parquet' = 'https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/Connectivity_783.parquet'
  'Completeness_783.csv' = 'https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/Completeness_783.csv'
}
foreach ($name in $files.Keys) {
  $target = Join-Path 'data/whole-brain/raw' $name
  if (!(Test-Path $target)) {
    Invoke-WebRequest $files[$name] -Proxy http://127.0.0.1:7897 -OutFile "$target.part" -TimeoutSec 300
    Move-Item -LiteralPath "$target.part" -Destination $target
  }
}
if (!(Test-Path 'data/whole-brain/connectome.npz')) {
  & .venv-brain/Scripts/python.exe experiments/whole_brain/prepare.py
  if ($LASTEXITCODE -ne 0) { throw 'Connectome preparation failed' }
}
& .venv-brain/Scripts/python.exe src/brain/prepare_runtime.py
if ($LASTEXITCODE -ne 0) { throw 'Runtime mapping preparation failed' }
New-Item -ItemType Directory 'data/brain-view' -Force | Out-Null
if (!(Test-Path 'data/brain-view/coordinates.csv.gz')) {
  Invoke-WebRequest 'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/coordinates.csv.gz' -Proxy http://127.0.0.1:7897 -OutFile 'data/brain-view/coordinates.csv.gz' -TimeoutSec 120
}
& .venv-brain/Scripts/python.exe scripts/prepare-brain-view.py
if ($LASTEXITCODE -ne 0) { throw 'Brain view coordinate preparation failed' }
