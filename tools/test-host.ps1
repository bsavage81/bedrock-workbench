param([string]$Tests = 'test/host.cjs')
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceRoot
node tools/prepare-host-test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare host test project' }
$hostProject = (Get-Content -LiteralPath '.test-temp\host-project-path.txt' -Raw).Trim()
$hostArguments = @(
  '--extensionDevelopmentPath="' + $workspaceRoot + '"'
  '--extensionTestsPath="' + (Join-Path $workspaceRoot $Tests) + '"'
  '--user-data-dir="' + $workspaceRoot + '\.test-temp\vscode-user"'
  '--extensions-dir="' + $workspaceRoot + '\.test-temp\vscode-extensions"'
  '--disable-workspace-trust'
  '--disable-extensions'
  '--skip-welcome'
  '--skip-release-notes'
  '--new-window'
  '"' + $hostProject + '"'
)
$codeExecutable = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
if (!(Test-Path -LiteralPath $codeExecutable)) {
  $codeCommand = Get-Command code -ErrorAction Stop
  $codeExecutable = Join-Path (Split-Path -Parent (Split-Path -Parent $codeCommand.Source)) 'Code.exe'
}
$hostProcess = Start-Process -FilePath $codeExecutable -ArgumentList $hostArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput '.test-temp\host.stdout.log' -RedirectStandardError '.test-temp\host.stderr.log'
# Retain the process handle before exit so Windows PowerShell can read ExitCode.
$hostHandle = $hostProcess.Handle
$hostFinished = $false
for ($hostAttempt = 0; $hostAttempt -lt 6; $hostAttempt++) {
  if ($hostProcess.WaitForExit(30000)) { $hostFinished = $true; break }
  Write-Output 'VS Code host checks are still running...'
}
if (!$hostFinished) { throw 'VS Code host test exceeded 180 seconds. Inspect .test-temp/host.*.log.' }
Get-Content -LiteralPath '.test-temp\host.stdout.log' -Tail 16
if ($hostProcess.ExitCode -ne 0) {
  Get-Content -LiteralPath '.test-temp\host.stderr.log' -Tail 20
  throw "VS Code host test failed: $($hostProcess.ExitCode)"
}
if (!(Test-Path -LiteralPath 'HOST_VERIFICATION.json')) {
  Get-Content -LiteralPath '.test-temp\host.stderr.log' -Tail 20
  throw 'Host verification result was not produced'
}
Get-Content -LiteralPath 'HOST_VERIFICATION.json'
