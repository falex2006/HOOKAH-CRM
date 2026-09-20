param([string]$BaseUrl = 'http://localhost:3000')

$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only route test refused non-local BaseUrl: $BaseUrl" }

$routes = @('/', '/login', '/admin', '/clients', '/inventory', '/finance', '/finance/categories', '/finance/report', '/reservations', '/orders', '/integrations', '/network', '/delivery')
$failed = @()
foreach ($route in $routes) {
  try {
    $response = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $route) -UseBasicParsing
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch '<html') { $failed += "$route (invalid HTML response)" }
  } catch { $failed += "$route ($($_.Exception.Message))" }
}
if ($failed.Count) { throw "Local route smoke failed: $($failed -join '; ')" }
$health = Invoke-RestMethod ($BaseUrl.TrimEnd('/') + '/api/health')
if ($health.status -ne 'ok') { throw 'Local health check failed' }
Write-Output "LOCAL ROUTE TEST: PASS ($($routes.Count) routes)"
