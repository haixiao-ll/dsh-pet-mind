# ocr.ps1 -- read base64 image from stdin, OCR with the built-in Windows engine, print UTF-8 text.
#
# Why PowerShell + WinRT: Windows 10/11 ship an OCR engine (Windows.Media.Ocr) with the
# installed language packs. No Python, no Tesseract, no model download, and the image never
# touches the disk: bytes arrive on stdin, are decoded into an in-memory WinRT stream,
# recognized, and the object graph is dropped when the process exits.
#
# Contract (host/src/host/mind/ocr.ts):
#   stdin  : base64 of a JPEG/PNG (whitespace ignored)
#   stdout : UTF-8 recognized text (may be empty), or NO_ENGINE / NO_INPUT
#   exit   : 0 on success, non-zero only for unexpected failures
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads .ps1 files without a BOM as ANSI,
# and non-ASCII literals then break parsing. All Chinese text comes from the OCR engine.

[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ErrorActionPreference = 'Stop'

$b64 = [Console]::In.ReadToEnd()
if (-not $b64 -or $b64.Trim().Length -eq 0) { Write-Output 'NO_INPUT'; exit 0 }

try {
  $bytes = [Convert]::FromBase64String(($b64 -replace '\s', ''))
} catch {
  Write-Output 'BAD_BASE64'
  exit 0
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
$writer = New-Object Windows.Storage.Streams.DataWriter($stream)
$writer.WriteBytes($bytes)
Await ($writer.StoreAsync()) ([uint32]) | Out-Null
$writer.DetachStream() | Out-Null
$stream.Seek(0)

$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Output 'NO_ENGINE'; exit 0 }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output $result.Text
