param(
  [string]$BaseUrl = 'http://localhost:3000',
  [int]$Count = 100
)

$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only load test refused non-local BaseUrl: $BaseUrl" }
if ($Count -lt 1 -or $Count -gt 1000) { throw 'Count must be between 1 and 1000' }
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.status -ne 'ok') { throw "Local CRM is not healthy: $BaseUrl" }

$runId = (Get-Date).ToString('yyyyMMddHHmmss')
$created = 0
$closed = 0
for ($i = 1; $i -le $Count; $i++) {
  $tableId = "local-load-$runId-$i"
  $order = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body (@{
    tableId = $tableId
    orderType = 'regular'
  } | ConvertTo-Json)
  if (-not $order.id) { throw "Order $i was not created" }
  $created++

  $item = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/items" -ContentType 'application/json' -Body (@{
    productId = 'redbull'
    quantity = 1
  } | ConvertTo-Json)
  if ($item.quantity -ne 1 -or $item.productId -ne 'redbull') { throw "Order $i item failed" }

  $closedOrder = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/close" -ContentType 'application/json' -Body '{}'
  if ($closedOrder.status -ne 'closed' -or $closedOrder.finalTotal -ne 250) { throw "Order $i close invariant failed" }
  $closed++
  # Keep generated order IDs distinct even on fast local machines.
  Start-Sleep -Milliseconds 5
}

$audit = Invoke-RestMethod "$BaseUrl/api/audit?limit=300"
if (-not $audit.items -or $audit.items.Count -lt ($Count * 3)) { throw 'Expected create/item/close audit events were not recorded' }
Write-Output "LOCAL 100-ORDER TEST: PASS (created=$created, closed=$closed, audit=$($audit.items.Count))"
