# Workforce 2.0 -- install from one line.
#
#     irm https://workforce.trackmystartup.com/install.ps1 | iex
#
# No stub installer to ship and no payload bundled anywhere: this fetches the
# current Windows build straight from the release, checks it against the
# published SHA-256, and runs it.
#
# The version, the URL and the hash all come from releases.json, which is the
# same file the download page reads. That means a new release never needs this
# script edited, and the page and the command can never disagree.

$ErrorActionPreference = 'Stop'
$base = 'https://workforce.trackmystartup.com'

if (-not [Environment]::Is64BitOperatingSystem) { throw 'Workforce 2.0 needs 64-bit Windows.' }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

Write-Host ''
Write-Host '  Workforce 2.0' -ForegroundColor Cyan

$meta = (Invoke-WebRequest -UseBasicParsing "$base/releases.json").Content | ConvertFrom-Json
$win  = $meta.builds.win
if (-not $win.file -or "$($win.sha256)" -match 'TODO') { throw 'No Windows build is published yet.' }

$out = Join-Path $env:TEMP "Workforce-2.0-Setup-$($win.version).exe"
Write-Host "  Version $($win.version) - $($win.size)" -ForegroundColor DarkGray
Write-Host ''

# Streamed by hand so there is a progress bar. Invoke-WebRequest -OutFile
# redraws its progress on every read block, which drags a 150 MB download out
# to several times the wall-clock time on the same connection.
$ok = $false
try {
  Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromMinutes(60)
  $resp = $client.GetAsync($win.file, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  $resp.EnsureSuccessStatusCode() | Out-Null
  $total = $resp.Content.Headers.ContentLength
  $in = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
  $fh = [IO.File]::Create($out)
  try {
    $buf = New-Object byte[] 262144
    $done = 0; $tick = 0
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $fh.Write($buf, 0, $n); $done += $n
      if ((($tick++) % 32) -eq 0 -and $total) {
        Write-Progress -Activity 'Downloading Workforce 2.0' `
          -Status ('{0:N0} of {1:N0} MB' -f ($done / 1MB), ($total / 1MB)) `
          -PercentComplete ([Math]::Min(100, $done * 100 / $total))
      }
    }
  } finally { $fh.Dispose(); $in.Dispose(); $client.Dispose() }
  $ok = $true
} catch {
  Write-Host "  Streaming download unavailable ($($_.Exception.Message)). Falling back." -ForegroundColor DarkGray
}
if (-not $ok) { Invoke-WebRequest -UseBasicParsing -Uri $win.file -OutFile $out }
Write-Progress -Activity 'Downloading Workforce 2.0' -Completed

# A download nobody checked is a download anybody could have replaced.
$have = (Get-FileHash $out -Algorithm SHA256).Hash
if ($have -ne "$($win.sha256)".ToUpper()) {
  Remove-Item $out -Force -ErrorAction SilentlyContinue
  throw "That file is not the one we published. Expected $($win.sha256), got $have. Nothing was installed."
}
Write-Host '  Checksum matches.' -ForegroundColor DarkGray
Write-Host '  Installing...'

# /S is a silent install into the per-user default location. Nothing here needs
# administrator rights, so nothing here asks for them.
$p = Start-Process -FilePath $out -ArgumentList '/S' -Wait -PassThru
Remove-Item $out -Force -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0) { throw "The installer stopped with code $($p.ExitCode)." }

Write-Host ''
Write-Host '  Done. Workforce 2.0 is in your Start menu.' -ForegroundColor Green
Write-Host '  First launch asks for a free Google key: https://aistudio.google.com/apikey' -ForegroundColor DarkGray
Write-Host ''
