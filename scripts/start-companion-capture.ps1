param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$root = 'E:\webcast_mate'
$proxy = 'http://127.0.0.1:8827'

$exe = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName '直播伴侣.exe' } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending |
  Select-Object -First 1

if (-not $exe) {
  Write-Host ('没有在 ' + $root + ' 下找到直播伴侣，请检查安装目录。') -ForegroundColor Yellow
  exit 1
}

$running = @(Get-Process -Name '直播伴侣' -ErrorAction SilentlyContinue)

if ($DryRun) {
  Write-Host ('检测到的伴侣：' + $exe)
  Write-Host ('将使用参数：--proxy-server="' + $proxy + '"')
  Write-Host ('当前伴侣进程数：' + $running.Count)
  exit 0
}

if ($running.Count -gt 0) {
  Write-Host '检测到直播伴侣正在运行：请先在伴侣内结束直播并完全退出，再用本入口启动，代理参数才会生效。' -ForegroundColor Yellow
  exit 1
}

$listener = Get-NetTCPConnection -LocalPort 8827 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  Write-Host '警告：127.0.0.1:8827 没有监听，采集器可能还没启动；请先运行 start-collector.cmd，否则弹幕抓不到。' -ForegroundColor Yellow
}

Write-Host ('以采集代理启动：' + $exe)
Start-Process -FilePath $exe -WorkingDirectory (Split-Path -LiteralPath $exe) -ArgumentList ('--proxy-server="' + $proxy + '"')
exit 0
