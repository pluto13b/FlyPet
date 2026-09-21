param([string]$Label='sample',[int]$Seconds=20,[int]$MainPid=0,[string]$Url='http://127.0.0.1:8789')
. "$PSScriptRoot/env.ps1"
# Follow descendants rather than executable paths: Windows venv launchers spawn base Python.
$all=Get-CimInstance Win32_Process
$main=$all | Where-Object { $_.ExecutablePath -eq "$FlyPetRoot\node_modules\electron\dist\electron.exe" -and $_.CommandLine -notmatch '--type=' -and (!$MainPid -or $_.ProcessId -eq $MainPid) }
if(!$main){throw 'FlyPet is not running'}
$ids=[System.Collections.Generic.HashSet[uint32]]::new()
foreach($p in $main){[void]$ids.Add($p.ProcessId)}
do {$changed=$false;foreach($p in $all){if($ids.Contains($p.ParentProcessId) -and $ids.Add($p.ProcessId)){$changed=$true}}}while($changed)
$before=@{}
foreach($p in $all){if($ids.Contains($p.ProcessId)){$before[$p.ProcessId]=[double]$p.KernelModeTime+[double]$p.UserModeTime}}
$logical=(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$startStatus=$null
try{$startStatus=Invoke-RestMethod "$Url/status"}catch{}
$start=Get-Date
Start-Sleep -Seconds $Seconds
$duration=((Get-Date)-$start).TotalSeconds
$after=Get-CimInstance Win32_Process | Where-Object {$before.ContainsKey($_.ProcessId)}
$rows=foreach($p in $after){
  $cores=(([double]$p.KernelModeTime+[double]$p.UserModeTime)-$before[$p.ProcessId])/1e7/$duration
  $role=if($p.CommandLine -match 'src\\vision\\worker.py'){'vision'}elseif($p.CommandLine -match 'src\\brain\\worker.py'){'brain'}elseif($p.CommandLine -match '--type=gpu-process'){'gpu-host'}elseif($p.CommandLine -match '--type=renderer'){'renderer'}elseif($p.CommandLine -match '--type=utility'){'utility'}else{'main'}
  [pscustomobject]@{pid=$p.ProcessId;role=$role;cpuCores=$cores;cpuPercent=$cores*100/$logical;workingSetMB=[double]$p.WorkingSetSize/1MB;privateMB=[double]$p.PrivatePageCount/1MB;command=$p.CommandLine}
}
$status=$null
try{$status=Invoke-RestMethod "$Url/status"}catch{}
$report=[pscustomobject]@{at=(Get-Date -Format o);durationSeconds=$duration;logicalProcessors=$logical;processes=@($rows);totals=@{cpuCores=($rows.cpuCores|Measure-Object -Sum).Sum;cpuPercent=($rows.cpuPercent|Measure-Object -Sum).Sum;workingSetMB=($rows.workingSetMB|Measure-Object -Sum).Sum;privateMB=($rows.privateMB|Measure-Object -Sum).Sum};runtime=$status.current.runtime;vision=$status.current.visual;brainAdvancedSeconds=($status.current.brainMs-$startStatus.current.brainMs)/1000;visualFramesAdvanced=$status.current.visual.frames-$startStatus.current.visual.frames}
New-Item -ItemType Directory -Path output/performance -Force | Out-Null
$report | ConvertTo-Json -Depth 7 | Set-Content (Join-Path 'output/performance' "$Label.json") -Encoding UTF8
$rows | Select-Object pid,role,cpuPercent,cpuCores,workingSetMB,privateMB | Format-Table -AutoSize
$report.totals | ConvertTo-Json
