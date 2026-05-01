<#
.SYNOPSIS
    Install / verify / uninstall the copilot-screenshot-picker extension.

.PARAMETER Verify
    Print green/red checks for install state and exit. Does not modify anything.

.PARAMETER DryRun
    Print planned actions without making changes.

.PARAMETER Uninstall
    Remove the extension symlink and (optionally) the config file.
#>

[CmdletBinding()]
param(
    [switch]$Verify,
    [switch]$DryRun,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtSource = Join-Path $RepoRoot '.github\extensions\screenshot-picker'
$ExtTarget = Join-Path $env:USERPROFILE '.copilot\extensions\screenshot-picker'
$ConfigPath = Join-Path $env:USERPROFILE '.copilot\screenshot-picker.json'
$DefaultScreenshotsDir = if ($env:OneDrive) { Join-Path $env:OneDrive 'screenshots' } else { Join-Path $env:USERPROFILE 'Pictures\Screenshots' }

function Write-Check {
    param([bool]$Ok, [string]$Message)
    if ($Ok) { Write-Host "  [✓] $Message" -ForegroundColor Green }
    else { Write-Host "  [✗] $Message" -ForegroundColor Red }
}

function Test-NodeVersion {
    try {
        $v = (& node --version) 2>$null
        if (-not $v) { return $false }
        $major = [int]($v.TrimStart('v').Split('.')[0])
        return $major -ge 18
    } catch { return $false }
}

function Test-IsLink {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item $Path -Force
    return $item.LinkType -in @('SymbolicLink', 'Junction')
}

if ($Verify) {
    Write-Host "Verifying copilot-screenshot-picker install..." -ForegroundColor Cyan
    Write-Check (Test-NodeVersion) "Node.js >= 18 available"
    Write-Check (Test-Path $DefaultScreenshotsDir) "Screenshot directory exists: $DefaultScreenshotsDir"
    $linkOk = (Test-IsLink $ExtTarget) -or (Test-Path (Join-Path $ExtTarget 'extension.mjs'))
    Write-Check $linkOk "Extension installed at: $ExtTarget"
    Write-Check (Test-Path $ConfigPath) "Config file exists: $ConfigPath"
    exit 0
}

if ($Uninstall) {
    Write-Host "Uninstalling copilot-screenshot-picker..." -ForegroundColor Cyan
    if (Test-Path $ExtTarget) {
        if ($DryRun) { Write-Host "  [DRY] Would remove: $ExtTarget" }
        else {
            Remove-Item $ExtTarget -Recurse -Force
            Write-Host "  Removed extension at $ExtTarget"
        }
    }
    if (Test-Path $ConfigPath) {
        $resp = if ($DryRun) { 'n' } else { Read-Host "Also delete config at $ConfigPath ? (y/N)" }
        if ($resp -eq 'y') {
            Remove-Item $ConfigPath -Force
            Write-Host "  Removed $ConfigPath"
        }
    }
    Write-Host "Uninstall complete." -ForegroundColor Green
    exit 0
}

# --- Install ---
Write-Host "Installing copilot-screenshot-picker..." -ForegroundColor Cyan

# 1. Node version
if (-not (Test-NodeVersion)) {
    Write-Host "  [!] Node.js 18+ is required. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "  [✓] Node.js >= 18"

# 2. Screenshot directory
if (-not (Test-Path $DefaultScreenshotsDir)) {
    Write-Host "  Default screenshots directory does not exist: $DefaultScreenshotsDir"
    if ($DryRun) {
        Write-Host "  [DRY] Would create $DefaultScreenshotsDir"
    } else {
        $resp = Read-Host "  Create it now? (Y/n)"
        if ($resp -ne 'n') {
            New-Item -ItemType Directory -Path $DefaultScreenshotsDir -Force | Out-Null
            Write-Host "  [✓] Created $DefaultScreenshotsDir"
        }
    }
} else {
    Write-Host "  [✓] Screenshot dir exists: $DefaultScreenshotsDir"
}

# 3. Capture-path redirect note (Snipping Tool)
Write-Host "  Note: To save Win+Shift+S captures here, open Snipping Tool > Settings"
Write-Host "        and set the auto-save path to '$DefaultScreenshotsDir'."
Write-Host "        (Registry path varies across Windows builds; we don't write it directly.)"

# 4. Install extension (copy — symlinks/junctions are not detected by Copilot CLI's
#    extension discovery scanner on Windows. We copy and re-sync each install.)
$ExtParent = Split-Path -Parent $ExtTarget
if (-not (Test-Path $ExtParent)) {
    if ($DryRun) { Write-Host "  [DRY] Would create $ExtParent" }
    else { New-Item -ItemType Directory -Path $ExtParent -Force | Out-Null }
}
if ($DryRun) {
    Write-Host "  [DRY] Would copy $ExtSource -> $ExtTarget"
} else {
    if (Test-Path $ExtTarget) { Remove-Item $ExtTarget -Recurse -Force }
    Copy-Item $ExtSource $ExtTarget -Recurse -Force
    Write-Host "  [✓] Copied extension to $ExtTarget"
    Write-Host "      (re-run install.ps1 to pick up source changes)"
}

# 5. Default config
if (-not (Test-Path $ConfigPath)) {
    if ($DryRun) {
        Write-Host "  [DRY] Would write default config to $ConfigPath"
    } else {
        $cfg = @{
            'screenshot-picker' = @{
                sources = @($DefaultScreenshotsDir)
            }
        } | ConvertTo-Json -Depth 4
        $configDir = Split-Path -Parent $ConfigPath
        if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
        Set-Content -Path $ConfigPath -Value $cfg -Encoding UTF8
        Write-Host "  [✓] Wrote default config to $ConfigPath"
    }
} else {
    Write-Host "  [✓] Config already exists: $ConfigPath"
}

if ($DryRun) {
    Write-Host "Dry run complete. Re-run without -DryRun to apply." -ForegroundColor Yellow
} else {
    Write-Host "Install complete. Open a Copilot CLI session and try /ss." -ForegroundColor Green
    Write-Host ""
    Write-Host "Devbox setup: see README.md > 'Remote dev (Linux/Mac)' section."
}
exit 0
