. "$PSScriptRoot/vision-env.ps1"
if (!(Test-Path '.venv-vision/Scripts/python.exe')) { python -m venv --system-site-packages .venv-vision }
& .venv-vision/Scripts/python.exe -m pip install --proxy http://127.0.0.1:7897 --index-url https://pypi.org/simple -r experiments/flyvis/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Official vision environment setup failed' }
& .venv-vision/Scripts/python.exe experiments/flyvis/fetch_weights.py
if ($LASTEXITCODE -ne 0) { throw 'Official pretrained weights download failed' }
