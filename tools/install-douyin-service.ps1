$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$base=Join-Path $PSScriptRoot 'cyber-xiaoya-danmaku\bin'
New-Item -ItemType Directory -Path $base -Force | Out-Null
$release=Invoke-WebRequest 'https://github.com/jwwsjlm/douyinLive/releases/latest' -UseBasicParsing -TimeoutSec 30
$tag=[regex]::Match($release.Content,'expanded_assets/([^"\s]+)').Groups[1].Value
if(!$tag){throw 'Cannot find official release tag'}
$assets=Invoke-WebRequest "https://github.com/jwwsjlm/douyinLive/releases/expanded_assets/$tag" -UseBasicParsing -TimeoutSec 30
$links=@($assets.Links | Where-Object {$_.href -match '/releases/download/' -and $_.href -match '(?i)windows.*(amd64|x86_64|64).*zip'})
if($links.Count -ne 1){throw 'Cannot select Windows x64 package. Check https://github.com/jwwsjlm/douyinLive/releases'}
$download='https://github.com'+$links[0].href
$zip=Join-Path $base 'douyinLive-release.zip'
Invoke-WebRequest $download -OutFile $zip -UseBasicParsing -TimeoutSec 180
$extract=Join-Path $base 'release'
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
$exe=@(Get-ChildItem -LiteralPath $extract -Recurse -Filter douyinLive.exe)
if($exe.Count -ne 1){throw 'Expected exactly one douyinLive.exe'}
Copy-Item -LiteralPath $exe[0].FullName -Destination (Join-Path $base 'douyinLive.exe') -Force
if(!(Test-Path (Join-Path $base 'config.yaml'))){Copy-Item -LiteralPath (Join-Path $base 'config.example.yaml') -Destination (Join-Path $base 'config.yaml')}
Write-Output "Installed official douyinLive $tag. Configure bin/config.yaml if needed, then connect in Studio."
