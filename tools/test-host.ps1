$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceRoot
node tools/prepare-host-test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare host test project' }
$hostProject = (Get-Content -LiteralPath '.test-temp\host-project-path.txt' -Raw).Trim()
$hostArguments = @(
  '--extensionDevelopmentPath="' + $workspaceRoot + '"'
  '--extensionTestsPath="' + $workspaceRoot + '\test\host.cjs"'
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
$hostProcess = Start-Process -FilePath $codeExecutable -ArgumentList $hostArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput '.test-temp\host.stdout.log' -RedirectStandardError '.test-temp\host.stderr.log'
if (!$hostProcess.WaitForExit(60000)) { throw 'VS Code host test exceeded 60 seconds. Inspect .test-temp/host.*.log.' }
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
