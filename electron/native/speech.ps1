$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
function Emit($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Depth 6 -Compress))
  [Console]::Out.Flush()
}
$synth = $null
$audioStream = $null
$managedStream = $null
$memory = $null
$player = $null
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
  $voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices)
  if ($request.mode -eq 'voices') {
    $items = @($voices | ForEach-Object {
      @{ id = $_.DisplayName; name = $_.DisplayName; language = $_.Language; gender = $(if ([int]$_.Gender -eq 1) { 'female' } else { 'male' }) }
    })
    Emit @{ event = 'voices'; voices = $items }
    exit 0
  }
  $voice = $voices | Where-Object { $_.DisplayName -eq $request.voice } | Select-Object -First 1
  if (-not $voice) { throw 'Requested Windows voice is not installed' }
  if ([string]::IsNullOrWhiteSpace($request.text)) { throw 'Speech text is empty' }
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $synth.Voice = $voice
  $synth.Options.SpeakingRate = [double]$request.rate
  $synth.Options.AudioVolume = [double]$request.volume
  Emit @{ event = 'synthesizing'; voice = $voice.DisplayName }
  $operation = $synth.SynthesizeTextToStreamAsync([string]$request.text)
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($operation))
  $audioStream = $task.GetAwaiter().GetResult()
  $managedStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($audioStream)
  $memory = New-Object IO.MemoryStream
  $managedStream.CopyTo($memory)
  $memory.Position = 0
  if ($request.mode -eq 'render') {
    [IO.File]::WriteAllBytes([string]$request.outputFile, $memory.ToArray())
    Emit @{ event = 'completed'; bytes = $memory.Length; output = 'wav' }
  } else {
    $player = [System.Media.SoundPlayer]::new($memory)
    $player.Load()
    Emit @{ event = 'playing'; bytes = $memory.Length; voice = $voice.DisplayName }
    $player.PlaySync()
    Emit @{ event = 'completed'; bytes = $memory.Length }
  }
} catch {
  Emit @{ event = 'error'; message = $_.Exception.Message }
  exit 1
} finally {
  if ($player) { $player.Stop(); $player.Dispose() }
  if ($managedStream) { $managedStream.Dispose() }
  if ($audioStream) { $audioStream.Dispose() }
  if ($memory) { $memory.Dispose() }
  if ($synth) { $synth.Dispose() }
}
