param(
  [string]$BaseUrl = 'http://localhost:3000'
)
$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost','127.0.0.1','::1')) { throw "Local-only asset test refused non-local BaseUrl: $BaseUrl" }
$routes = @('/','/admin','/login','/inventory','/finance','/finance/categories','/finance/report','/reservations','/clients','/orders','/integrations','/network','/delivery')
$seen = [System.Collections.Generic.HashSet[string]]::new()
$missing = [System.Collections.Generic.List[string]]::new()
foreach ($route in $routes) {
  $html = (Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl$route").Content
  $refs = [regex]::Matches($html, '(?:src|href)=["'']([^"'']+)["'']') | ForEach-Object { $_.Groups[1].Value }
  foreach ($ref in $refs) {
    if ([string]::IsNullOrWhiteSpace($ref) -or $ref.StartsWith('http') -or $ref.StartsWith('data:') -or $ref.StartsWith('#')) { continue }
    $asset = ([Uri]::new([Uri]$BaseUrl, $ref)).PathAndQuery
    if (-not $seen.Add($asset)) { continue }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl$asset"
      if ($response.StatusCode -ne 200) { $missing.Add("$asset ($($response.StatusCode))") }
    } catch { $missing.Add($asset) }
  }
}
if ($missing.Count) { throw "Missing local assets: $($missing -join ', ')" }
Write-Output "LOCAL ASSET TEST: PASS (routes=$($routes.Count), assets=$($seen.Count))"
