param([ValidateSet('credentials','token-read','token-write')][string]$Mode,[string]$PrivateDirectory)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules'
$privateDir=$PrivateDirectory
try {
    if($Mode -eq 'credentials') {
        $saved=[IO.File]::ReadAllText((Join-Path $privateDir 'kis-credentials.dpapi.json')) | ConvertFrom-Json
        if($saved.format -ne 'windows-dpapi-current-user-v1'){throw 'format'}
        $result=@{}
        foreach($name in @('appKey','appSecret')){
            $secure=ConvertTo-SecureString $saved.$name
            $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
            try{$result[$name]=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
            finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
        }
        [Console]::Out.Write(($result|ConvertTo-Json -Compress))
    } elseif($Mode -eq 'token-read') {
        $file=Join-Path $privateDir 'kis-token.dpapi'
        if(!(Test-Path -LiteralPath $file)){[Console]::Out.Write('{}');exit 0}
        $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($file))
        $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr))}
        finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
    } else {
        $inputText=[Console]::In.ReadToEnd()
        $secure=ConvertTo-SecureString $inputText -AsPlainText -Force
        try{$encrypted=ConvertFrom-SecureString $secure;[IO.File]::WriteAllText((Join-Path $privateDir 'kis-token.dpapi'),$encrypted)}
        finally{$secure.Dispose()}
        [Console]::Out.Write('{}')
    }
} catch {
    # Never forward exception text or decrypted values to terminal or HTTP clients.
    [Console]::Error.Write('Windows credential vault operation failed.')
    exit 1
}
