. "$PSScriptRoot/env.ps1"
if (!(Test-Path 'node_modules/electron/dist/electron.exe')) { throw 'Run scripts/install.ps1 first.' }
if (!(Test-Path '.venv-brain/Scripts/python.exe') -or !(Test-Path 'data/whole-brain/runtime-map.npz')) { throw 'Run scripts/setup-brain.ps1 first.' }
if (!(Test-Path '.venv-vision/Scripts/python.exe') -or !(Test-Path 'data/flyvis/results/flow/0000/000/chkpts/chkpt_00000')) { throw 'Run scripts/setup-vision.ps1 first.' }
$launchArgs = @('.') + @($args)
$process = Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' -ArgumentList $launchArgs -WorkingDirectory $FlyPetRoot -WindowStyle Hidden -PassThru
$process.WaitForExit()
exit $process.ExitCode
