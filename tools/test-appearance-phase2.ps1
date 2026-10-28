param([switch]$Interactive)
$ErrorActionPreference = 'Stop'
$appearanceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $appearanceRoot
node tools/prepare-appearance-phase2-test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare pinned appearance fixtures' }
$appearanceTest = if ($Interactive) { 'test/appearance-phase2-host.cjs' } else { 'test/appearance-layout-host.cjs' }
$appearanceWindowStyle = if ($Interactive) { 'Normal' } else { 'Hidden' }
$appearanceUser = '.test-temp/appearance-phase2-run-' + [guid]::NewGuid().ToString('N')
$appearanceArguments = @(
 ('--extensionDevelopmentPath="' + $appearanceRoot + '"')
 ('--extensionTestsPath="' + (Join-Path $appearanceRoot $appearanceTest) + '"')
 ('--user-data-dir="' + (Join-Path $appearanceRoot $appearanceUser) + '"')
 ('--extensions-dir="' + (Join-Path $appearanceRoot '.test-temp/vscode-extensions') + '"')
 '--disable-workspace-trust'
 '--disable-extensions'
 '--skip-welcome'
 '--skip-release-notes'
 '--new-window'
 ('"' + (Join-Path $appearanceRoot '.test-temp/appearance-phase2-project') + '"')
)
$appearanceExecutable = 'C:\Users\beauj\AppData\Local\Programs\Microsoft VS Code\Code.exe'
if (!(Test-Path -LiteralPath $appearanceExecutable)) { $appearanceExecutable = Join-Path (Split-Path -Parent (Split-Path -Parent (Get-Command code -ErrorAction Stop).Source)) 'Code.exe' }
$appearanceProcess = Start-Process -FilePath $appearanceExecutable -ArgumentList $appearanceArguments -WindowStyle $appearanceWindowStyle -PassThru
$appearanceHandle = $appearanceProcess.Handle
if ($Interactive) { Write-Output 'Operate the real viewer: adult plains/farmer; desert/librarian/gold tier; baby and adult; Layers isolate/restore; Inspect manual assets; return to Appearance.' }
for ($appearanceAttempt=0; $appearanceAttempt -lt 32; $appearanceAttempt++) { if ($appearanceProcess.WaitForExit(30000)) { if ($appearanceProcess.ExitCode -ne 0) { throw "Native appearance host failed ($($appearanceProcess.ExitCode))" }; exit 0 }; Write-Output 'Native appearance verification is still running...' }
throw 'Native appearance host timed out. Inspect .test-temp/appearance-*-host.json and the development host.'
