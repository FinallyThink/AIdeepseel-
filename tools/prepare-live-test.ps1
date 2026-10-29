$ErrorActionPreference='Stop'
$workspace=Split-Path -Parent $PSScriptRoot
$collector=Join-Path $workspace 'tools\DouyinBarrageGrab-v2.8.0\WssBarrageServer.exe'
$companion='E:\webcast_mate\13.2.1.525908160\直播伴侣.exe'
$reportFile=Join-Path $PSScriptRoot 'live-preparation.json'
function Report($value){$value|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $reportFile -Encoding UTF8}
try{
  Report @{status='restarting';at=(Get-Date).ToString('o')}
  $collectors=@(Get-CimInstance Win32_Process -Filter "Name='WssBarrageServer.exe'"|Where-Object{$_.ExecutablePath -eq $collector})
  foreach($watcher in @($collectors|Where-Object{$_.CommandLine -match '--watchdog'})){Stop-Process -Id $watcher.ProcessId -ErrorAction SilentlyContinue}
  foreach($oldCollector in @($collectors|Where-Object{$_.CommandLine -notmatch '--watchdog'})){Stop-Process -Id $oldCollector.ProcessId -ErrorAction SilentlyContinue}
  foreach($oldCompanion in @(Get-CimInstance Win32_Process -Filter "Name='直播伴侣.exe'"|Where-Object{$_.ExecutablePath -eq $companion})){Stop-Process -Id $oldCompanion.ProcessId -ErrorAction SilentlyContinue}
  $flags=@('--listen-any','false','--sys-proxy','false','--ws-port','8888','--proxy-port','8827','--process-filter','直播伴侣','--push-filter','1,5')
  $capture=Start-Process -FilePath $collector -ArgumentList $flags -WorkingDirectory (Split-Path -Parent $collector) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'collector.stdout.log') -RedirectStandardError (Join-Path $PSScriptRoot 'collector.stderr.log') -PassThru
  $env:ELECTRON_RUN_AS_NODE=$null;$env:NODE_OPTIONS=$null
  $mate=Start-Process -FilePath $companion -ArgumentList '--proxy-server=http://127.0.0.1:8827' -WorkingDirectory (Split-Path -Parent $companion) -WindowStyle Hidden -PassThru
  Report @{status='started';at=(Get-Date).ToString('o');collectorPid=$capture.Id;companionPid=$mate.Id;systemProxyChanged=$false;companionFilesChanged=$false}
}catch{Report @{status='error';message=$_.Exception.Message;at=(Get-Date).ToString('o')};exit 1}
