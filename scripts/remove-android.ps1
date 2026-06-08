Param(
  [string]$Path = "android"
)

if (-not (Test-Path $Path)) {
  Write-Host "Path '$Path' does not exist. Nothing to remove."
  exit 0
}

Write-Host "About to remove directory: $Path"
Write-Host "This will delete the folder and all its contents. Press Y to continue, any other key to cancel."

$confirmation = Read-Host "Proceed? (Y/N)"
if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
  Write-Host "Cancelled."
  exit 0
}

try {
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
  Write-Host "Removed '$Path' successfully."
} catch {
  Write-Error "Failed to remove '$Path': $_"
  exit 1
}
