#requires -Version 5.1

[CmdletBinding()]
param(
  [Parameter()]
  [string]$RepoUrl = "https://github.com/TUR1412/ACG.git",

  [Parameter()]
  [string]$WorkDir = (Join-Path $HOME "work"),

  [Parameter()]
  [string]$RepoDir = "ACG",

  [Parameter()]
  [bool]$Clone = $false,

  [Parameter()]
  [bool]$InstallDeps = $true,

  [Parameter()]
  [bool]$RunCheck = $true,

  [Parameter()]
  [bool]$RunBuild = $true,

  [Parameter()]
  [bool]$Commit = $false,

  [Parameter()]
  [string]$CommitMessage = "feat(GOD-MODE): Ultimate Evolution - Quark-level UI & Arch Upgrade",

  [Parameter()]
  [bool]$Push = $false,

  [Parameter()]
  [bool]$ForceWithLease = $false,

  [Parameter()]
  [bool]$Cleanup = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
  param([Parameter(Mandatory)][string]$Name)
  if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Assert-Command "git"
if ($InstallDeps -or $RunCheck -or $RunBuild) {
  Assert-Command "node"
  Assert-Command "npm"
}

$repoPath = ""
if ($Clone) {
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  $repoPath = Join-Path $WorkDir $RepoDir
  if (-not (Test-Path $repoPath)) {
    git clone $RepoUrl $repoPath
  }
} else {
  $repoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

Push-Location $repoPath
try {
  if ($InstallDeps) {
    npm ci
  }

  if ($RunCheck) {
    npm run check
  }

  if ($RunBuild) {
    npm run build
  }

  if ($Commit) {
    git add -A
    $status = git status --porcelain
    if ($status) {
      git commit -m $CommitMessage
    } else {
      Write-Host "No changes to commit."
    }
  }

  if ($Push) {
    if ($ForceWithLease) {
      git push --force-with-lease
    } else {
      git push
    }
  }
} finally {
  Pop-Location
}

if ($Cleanup -and $Clone) {
  Remove-Item -Recurse -Force -Path $repoPath
}

