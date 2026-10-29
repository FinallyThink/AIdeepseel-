param([switch]$Clear)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'cyber-xiaoya-danmaku\bin\config.yaml'
$secret = $null
$pointer = [IntPtr]::Zero
try {
    $text = [IO.File]::ReadAllText($configPath)
    $pattern = '(?m)^(\s+douyin:\s*)[^\r\n]*'
    if ([regex]::Matches($text, $pattern).Count -ne 1) {
        throw 'Expected exactly one default douyin cookie setting. No changes made.'
    }
    if ($Clear) {
        $encoded = '""'
    } else {
        Write-Host 'Douyin login cookie - local test only'
        Write-Host 'Paste the Cookie request-header value below, then press Enter.'
        Write-Host 'Input is hidden. Never paste it into chat. Empty input cancels.'
        $secret = Read-Host 'Cookie' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $cookie = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
        if (!$cookie) { Write-Host 'Cancelled.'; exit 0 }
        $cookie = $cookie -replace '^(?i)cookie:\s*', ''
        if ($cookie -match '[\r\n]' -or $cookie -notmatch '(?i)(^|;\s*)(sessionid|sessionid_ss)=([^;\s]+)') {
            throw 'No login session cookie found. Copy the Cookie request header from a logged-in Douyin page.'
        }
        $encoded = ConvertTo-Json -InputObject $cookie -Compress
    }
    $updated = [regex]::Replace($text, $pattern, [Text.RegularExpressions.MatchEvaluator]{param($m) $m.Groups[1].Value + $encoded})
    [IO.File]::WriteAllText($configPath, $updated, (New-Object Text.UTF8Encoding($false)))
    Write-Host $(if ($Clear) {'Cookie cleared.'} else {'Saved locally. Reconnect the collector after restarting its service. Clear this cookie after the test.'})
} catch {
    Write-Host ('Failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($pointer -ne [IntPtr]::Zero) {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    if ($secret) {$secret.Dispose()}
    $cookie = $null
    $encoded = $null
    if (!$Clear) {Read-Host 'Press Enter to close' | Out-Null}
}
