param(
  [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only acceptance refused non-local BaseUrl: $BaseUrl" }
$root = Split-Path -Parent $PSScriptRoot
$checks = @(
  @{ file = 'local-static-boundary.mjs'; node = $true },
  @{ file = 'local-click-contract.mjs'; node = $true },
  @{ file = 'local-design-contract.mjs'; node = $true },
  @{ file = 'local-deploy-contract.mjs'; node = $true },
  @{ file = 'local-route-smoke.ps1'; args = @('-BaseUrl', $BaseUrl) },
  @{ file = 'local-role-contract.mjs'; node = $true },
  @{ file = 'local-insights-contract.mjs'; node = $true },
  @{ file = 'local-date-contract.mjs'; node = $true },
  @{ file = 'local-asset-smoke.ps1'; args = @('-BaseUrl', $BaseUrl) },
  @{ file = 'local-login-contract.mjs'; node = $true },
  @{ file = 'local-saas-contract.mjs'; node = $true },
  @{ file = 'local-saas-onboarding-contract.mjs'; node = $true },
  @{ file = 'local-tea-catalog.ps1'; args = @('-BaseUrl', $BaseUrl) },
  @{ file = 'local-crud-contract.mjs'; node = $true },
  @{ file = 'local-guest-order.ps1'; args = @('-BaseUrl', $BaseUrl) },
  # Keep the default acceptance run lightweight; use local-100-orders.ps1 -Count 100 for an explicit load pass.
  @{ file = 'local-100-orders.ps1'; args = @('-BaseUrl', $BaseUrl, '-Count', '10') },
  @{ file = '..\smoke-test.ps1'; args = @('-BaseUrl', $BaseUrl) }
)
foreach ($check in $checks) {
  $path = Join-Path $PSScriptRoot $check.file
  if (-not (Test-Path $path)) { $path = Join-Path $root $check.file }
  Write-Output "RUN $($check.file)"
  if ($check.node) { & node $path $BaseUrl }
  else { & pwsh -NoProfile -File $path @($check.args) }
  if ($LASTEXITCODE -ne 0) { throw "Acceptance check failed: $($check.file)" }
}
Write-Output 'LOCAL ACCEPTANCE: PASS (routes/assets, catalog, guests, 10 orders, finance and delivery)'
