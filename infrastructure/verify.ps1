$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
if (!(Test-Path '.env')) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  [IO.File]::WriteAllText((Join-Path $repo '.env'), "CREDITFLOW_DB_PASSWORD=$secret`n")
}
node infrastructure/verify.cjs
if ($LASTEXITCODE -ne 0) { throw 'Verification failed; inspect Maven reports' }
