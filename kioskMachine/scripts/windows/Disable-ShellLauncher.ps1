[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KioskUser
)

$ErrorActionPreference = 'Stop'

function Assert-WmiSuccess {
    param([object]$Result, [string]$Action)

    $returnCode = if ($null -ne $Result.PSObject.Properties['ReturnValue']) {
        [uint32]$Result.ReturnValue
    } else {
        [uint32]$Result
    }

    if ($returnCode -ne 0) {
        throw "$Action failed. WMI returned code $returnCode."
    }
}

$account = New-Object System.Security.Principal.NTAccount($KioskUser)
$sid = $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
$shellLauncherClass = [wmiclass]'\\localhost\root\standardcimv2\embedded:WESL_UserSetting'

$result = $shellLauncherClass.SetCustomShell($sid, 'explorer.exe', $null, $null, 0)
Assert-WmiSuccess -Result $result -Action 'Restoring Windows Explorer for the kiosk account'

Write-Host "Restored explorer.exe as the shell for $KioskUser ($sid)." -ForegroundColor Green
Write-Host 'Sign out and back in, or restart Windows, to apply the change.'
Write-Host 'This script intentionally does not disable Shell Launcher globally because another managed account may use it.'
