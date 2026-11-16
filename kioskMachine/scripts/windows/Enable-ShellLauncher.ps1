[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KioskUser,

    [string]$ExecutablePath = "$env:ProgramFiles\YPass Kiosk Machine\YPass Kiosk Machine.exe"
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

# Shell Launcher is supported on Education, Enterprise, and IoT Enterprise.
$edition = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').EditionID
$editionIsSupported = $edition -match '^(Education|Enterprise|EnterpriseS|IoTEnterprise|IoTEnterpriseS)$'
if (-not $editionIsSupported) {
    throw "Windows edition '$edition' does not support Shell Launcher. Use Windows Education, Enterprise, or IoT Enterprise, or configure an approved Assigned Access policy instead."
}

if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
    throw "Kiosk executable not found: $ExecutablePath. Install YPass Kiosk Machine first or pass -ExecutablePath with the installed EXE path."
}

# Enable the optional Windows feature if needed. A reboot may be required before
# the WMI provider becomes available, so stop and ask the administrator to rerun.
$feature = Get-WindowsOptionalFeature -Online -FeatureName 'Client-EmbeddedShellLauncher'
if ($feature.State -ne 'Enabled') {
    Enable-WindowsOptionalFeature -Online -FeatureName 'Client-DeviceLockdown', 'Client-EmbeddedShellLauncher' -All -NoRestart | Out-Null
    Write-Warning 'Shell Launcher was enabled. Restart Windows, then run this script again.'
    exit 0
}

$account = New-Object System.Security.Principal.NTAccount($KioskUser)
$sid = $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
$shellLauncherClass = [wmiclass]'\\localhost\root\standardcimv2\embedded:WESL_UserSetting'

# Shell Launcher monitors this Electron process. If it exits, action 0 restarts it.
# The quoted executable path supports the default Program Files install location.
$shellCommand = '"{0}" --kiosk-shell' -f $ExecutablePath
$result = $shellLauncherClass.SetCustomShell($sid, $shellCommand, $null, $null, 0)
Assert-WmiSuccess -Result $result -Action 'Configuring the kiosk account shell'

$result = $shellLauncherClass.SetEnabled($true)
Assert-WmiSuccess -Result $result -Action 'Enabling Shell Launcher'

Write-Host ''
Write-Host 'Shell Launcher is configured.' -ForegroundColor Green
Write-Host "Kiosk account: $KioskUser"
Write-Host "Account SID:   $sid"
Write-Host "Custom shell:  $shellCommand"
Write-Host 'The kiosk app will restart if it exits. Sign out and sign back in, or restart Windows, to apply the shell.'
Write-Host ''
Write-Warning 'Keep a separate administrator account available for maintenance. Do not configure the administrator account to use the kiosk shell.'
