# Signs resources/nym-proxy.exe with Azure Artifact Signing, before electron-builder
# packages it.
#
# electron-builder does not sign extraResources: its signing pass covers the app
# directory, resources/app.asar.unpacked and swiftshader, and nym-proxy.exe sits in
# resources/ instead. It is launched as a child process, so Smart App Control
# inspects it on its own — an unsigned copy would be blocked even with everything
# else signed. Signing the staged binary means electron-builder copies one that is
# already signed.
#
# Values mirror build.win.azureSignOptions in package.json. Credentials come from
# the same AZURE_* environment variables electron-builder uses.
#
#   pwsh -ExecutionPolicy Bypass -File scripts/sign-nym-proxy.ps1
#
# Must run under pwsh (PowerShell 7), not Windows PowerShell 5.1, whose PowerShellGet
# cannot load Install-Module in a CI runner. No extra dependency: electron-builder
# shells out to pwsh for Azure signing too, so it is already required.

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 6) {
  throw "Run this under pwsh (PowerShell 7+), not Windows PowerShell $($PSVersionTable.PSVersion)."
}

$binary = Join-Path (Split-Path -Parent $PSScriptRoot) "resources\nym-proxy.exe"
if (-not (Test-Path $binary)) { throw "Not staged yet: $binary" }

foreach ($v in "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET") {
  if (-not (Get-Item "env:$v" -ErrorAction SilentlyContinue)) {
    throw "$v is not set. Windows builds sign, so the Azure credentials are required."
  }
}

if (-not (Get-Module -ListAvailable -Name TrustedSigning)) {
  Write-Host "Installing TrustedSigning module..."
  Install-Module -Name TrustedSigning -Repository PSGallery -Scope CurrentUser -Force -AllowClobber
}
Import-Module TrustedSigning

Write-Host "Signing $binary..."
Invoke-TrustedSigning `
  -Endpoint "https://eus.codesigning.azure.net" `
  -CodeSigningAccountName "zingo-pc-signing" `
  -CertificateProfileName "Zingo-PC" `
  -Files $binary `
  -FileDigest SHA256 `
  -TimestampRfc3161 "http://timestamp.acs.microsoft.com" `
  -TimestampDigest SHA256

# Fail loudly rather than shipping an unsigned child process.
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName | Select-Object -Last 1
if ($signtool) {
  & $signtool.FullName verify /pa /q $binary
  if ($LASTEXITCODE -ne 0) { throw "nym-proxy.exe is not signed after Invoke-TrustedSigning" }
  Write-Host "Verified." -ForegroundColor Green
} else {
  Write-Warning "signtool.exe not found; signature not verified."
}
