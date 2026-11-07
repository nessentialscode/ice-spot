$ErrorActionPreference = 'Stop'

$pgpassDir = "$env:APPDATA\postgresql"
$pgpassFile = "$pgpassDir\pgpass.conf"

if (Test-Path $pgpassFile) {
    Write-Error "CRITICAL: $pgpassFile already exists. Aborting to avoid overwriting existing credentials."
    exit 1
}

if (-not (Test-Path $pgpassDir)) {
    New-Item -ItemType Directory -Path $pgpassDir -Force | Out-Null
    Write-Host "Created directory: $pgpassDir"
}

# Create empty file
New-Item -ItemType File -Path $pgpassFile -Force | Out-Null
Write-Host "Created empty file: $pgpassFile"

# Lock down permissions immediately before any secrets are entered
$acl = Get-Acl $pgpassFile
$acl.SetAccessRuleProtection($true, $false)
$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentIdentity,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
)
$acl.ResetAccessRule($rule)
Set-Acl $pgpassFile $acl

# Verify ACL immediately
$verifiedAcl = Get-Acl $pgpassFile
$accessEntries = @($verifiedAcl.Access)

if ($accessEntries.Count -ne 1 -or $accessEntries[0].IdentityReference.Value -ne $currentIdentity) {
    Remove-Item -Path $pgpassFile -Force
    Write-Error "ACL verification failed! Expected only $currentIdentity but found $($accessEntries.Count) rules. Aborting."
    exit 1
}
Write-Host "Permissions locked down. Verified access restricted solely to: $currentIdentity"

# Launch Notepad and wait for user to save and close
Write-Host "Launching Notepad for password entry. Please enter password, save, and close Notepad..."
$notepadProc = Start-Process -FilePath "notepad.exe" -ArgumentList "`"$pgpassFile`"" -Wait -PassThru

Write-Host "Notepad closed (ExitCode: $($notepadProc.ExitCode))."

# Post-close verification: check existence and ACL only (never read, display, or hash contents)
if (-not (Test-Path $pgpassFile)) {
    Write-Error "pgpass.conf does not exist after Notepad closed."
    exit 1
}

$finalAcl = Get-Acl $pgpassFile
$finalEntries = @($finalAcl.Access)

Write-Host "`n=== Post-Edit Verification (No Secrets Read or Logged) ==="
Write-Host "Path: $pgpassFile"
Write-Host "File Exists: True"
Write-Host "File Size: $((Get-Item $pgpassFile).Length) bytes"
Write-Host "ACL Entries Count: $($finalEntries.Count)"
$finalEntries | Format-Table IdentityReference, FileSystemRights, AccessControlType, IsInherited -AutoSize
