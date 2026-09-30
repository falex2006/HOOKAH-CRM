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
$loyalty = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/clients/$($client.id)/loyalty" -ContentType 'application/json' -Body (@{ delta = 25; reason = 'Проверка локального теста' } | ConvertTo-Json)
if ($loyalty.loyaltyPoints -ne 25 -or $loyalty.bonusBalance -ne 25) { throw 'Loyalty adjustment returned inconsistent balances' }
$guestAfterLoyalty = Invoke-RestMethod "$BaseUrl/api/clients"
$storedGuest = $guestAfterLoyalty.items | Where-Object { $_.id -eq $client.id } | Select-Object -First 1
if ($storedGuest.loyaltyPoints -ne 25 -or $storedGuest.bonusBalance -ne 25) { throw 'Guest list did not show the updated bonus balance' }
$product = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/products" -ContentType 'application/json' -Body (@{ name = "Гостевой тест $suffix"; category = 'bar'; price = 100 } | ConvertTo-Json)

$floorContext = Invoke-RestMethod "$BaseUrl/api/floor"
$zone = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/floor/zones" -ContentType 'application/json' -Body (@{ expectedVenueId = $floorContext.venueId; name = "Гостевой тест зал $suffix" } | ConvertTo-Json)
$table = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/floor/tables" -ContentType 'application/json' -Body (@{ expectedVenueId = $floorContext.venueId; zoneId = $zone.id; name = "Гостевой тест стол $suffix"; capacity = 2 } | ConvertTo-Json)
if (-not $table.id) { throw 'Guest test table was not created' }
$order = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body (@{
  tableId = $table.id
  orderType = 'regular'
} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/items" -ContentType 'application/json' -Body (@{ productId = $product.id; quantity = 1 } | ConvertTo-Json) | Out-Null

$bound = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($order.id)" -ContentType 'application/json' -Body (@{ clientId = $client.id } | ConvertTo-Json)
$boundPhone = if ($null -ne $bound.phone) { $bound.phone } else { $bound.guestPhone }
$boundClientId = if ($null -ne $bound.guestId) { $bound.guestId } else { $bound.clientId }
if ($bound.guestName -ne $client.name -or $boundPhone -ne $phone -or $boundClientId -ne $client.id) { throw 'Client was not bound to order' }

$noted = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($order.id)" -ContentType 'application/json' -Body (@{ notes = 'Без льда' } | ConvertTo-Json)
if ($noted.notes -ne 'Без льда') { throw 'Order note was not saved' }
$ordersAfter = Invoke-RestMethod "$BaseUrl/api/orders"
$storedOrder = $ordersAfter.items | Where-Object { $_.id -eq $order.id } | Select-Object -First 1
$storedClientId = if ($null -ne $storedOrder.guestId) { $storedOrder.guestId } else { $storedOrder.clientId }
if (-not $storedOrder -or $storedClientId -ne $client.id -or $storedOrder.guestPhone -ne $phone -or $storedOrder.notes -ne 'Без льда') { throw 'Guest binding or note was not persisted in order list' }

$history = Invoke-RestMethod "$BaseUrl/api/clients/$($client.id)/history"
if ($null -eq $history.orders -or $null -eq $history.reservations) { throw 'Client history response is incomplete' }
if (-not ($history.orders | Where-Object { $_.id -eq $order.id })) { throw 'Bound order was not persisted in client history' }
$audit = Invoke-RestMethod "$BaseUrl/api/audit?limit=100"
if (-not ($audit.items | Where-Object { $_.action -eq 'order.guest_updated' })) { throw 'Guest binding audit event was not recorded' }
Write-Output 'LOCAL GUEST-ORDER TEST: PASS'
