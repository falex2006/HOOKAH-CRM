param(
  [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only guest test refused non-local BaseUrl: $BaseUrl" }
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.status -ne 'ok') { throw "Local CRM is not healthy: $BaseUrl" }
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$phone = "+7999$($suffix.ToString().Substring($suffix.ToString().Length - 7))"

$client = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/clients" -ContentType 'application/json' -Body (@{
  name = "Локальный гость $suffix"
  phoneNumbers = @(
    @{ label = 'Основной'; number = $phone; primary = $true },
    @{ label = 'Рабочий'; number = '+79990009988'; primary = $false }
  )
  telegram = '@local_guest'
  tobaccoPreferences = @('Darkside', 'мята')
  bowlPreferences = @('Калауд', 'средняя крепость')
  barPreferences = @('Red Bull')
} | ConvertTo-Json -Depth 8)
if (-not $client.id -or $client.phoneNumbers.Count -ne 2) { throw 'Client profile was not created with multiple phones' }
$product = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/products" -ContentType 'application/json' -Body (@{ name = "Гостевой тест $suffix"; category = 'bar'; price = 100 } | ConvertTo-Json)

$order = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body (@{
  tableId = "local-guest-$suffix"
  orderType = 'regular'
} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/items" -ContentType 'application/json' -Body (@{ productId = $product.id; quantity = 1 } | ConvertTo-Json) | Out-Null

$bound = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($order.id)" -ContentType 'application/json' -Body (@{ clientId = $client.id } | ConvertTo-Json)
if ($bound.guestName -ne $client.name -or $bound.guestPhone -ne $phone) { throw 'Client was not bound to order' }

$noted = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($order.id)" -ContentType 'application/json' -Body (@{ notes = 'Без льда' } | ConvertTo-Json)
if ($noted.notes -ne 'Без льда') { throw 'Order note was not saved' }

$history = Invoke-RestMethod "$BaseUrl/api/clients/$($client.id)/history"
if ($null -eq $history.orders -or $null -eq $history.reservations) { throw 'Client history response is incomplete' }
$audit = Invoke-RestMethod "$BaseUrl/api/audit?limit=100"
if (-not ($audit.items | Where-Object { $_.action -eq 'order.guest_updated' })) { throw 'Guest binding audit event was not recorded' }
Write-Output 'LOCAL GUEST-ORDER TEST: PASS'
