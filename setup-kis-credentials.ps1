# Interactive local credential setup. Never print or serialize plaintext secrets.
param([string]$ProjectDirectory = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$privateDir = Join-Path $ProjectDirectory '..\.busangi-private'
$credentialPath = Join-Path $privateDir 'kis-credentials.dpapi.json'
$stage = 'initialization'
try {
    if (Test-Path -LiteralPath $credentialPath) {
        throw 'Credentials already exist. No files were overwritten.'
    }
    Write-Host 'Busangi - KIS quote API credentials' -ForegroundColor Cyan
    Write-Host 'Both inputs are hidden. Paste each value and press Enter.'
    Write-Host 'The values are encrypted for this Windows user on this computer.'
    Write-Host 'This step saves credentials only; it sends no requests or orders.'
    $stage = 'hidden input'
    $appKey = Read-Host 'App Key' -AsSecureString
    $appSecret = Read-Host 'App Secret' -AsSecureString
    if ($appKey.Length -eq 0 -or $appSecret.Length -eq 0) {
        throw 'Empty input. Nothing was saved.'
    }
    $stage = 'Windows encryption'
    $encryptedKey = ConvertFrom-SecureString -SecureString $appKey
    $encryptedSecret = ConvertFrom-SecureString -SecureString $appSecret
    $payload = [ordered]@{
        format = 'windows-dpapi-current-user-v1'
        environment = 'production'
        purpose = 'quotes-only'
        appKey = $encryptedKey
        appSecret = $encryptedSecret
    } | ConvertTo-Json
    $stage = 'encrypted file save'
    [void][IO.Directory]::CreateDirectory($privateDir)
    # CreateNew ensures that an existing credential file is never replaced.
    $stream = [IO.File]::Open($credentialPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($payload)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    Write-Host 'Saved encrypted credentials successfully. You can close this window.' -ForegroundColor Green
} catch {
    Write-Host 'Setup did not complete. No credential values will be displayed.' -ForegroundColor Yellow
    Write-Host ('Failed stage: ' + $stage + ' (' + $_.Exception.GetType().Name + ')')
} finally {
    if ($appKey) { $appKey.Dispose() }
    if ($appSecret) { $appSecret.Dispose() }
    Remove-Variable appKey, appSecret, encryptedKey, encryptedSecret, payload, bytes -ErrorAction SilentlyContinue
}
