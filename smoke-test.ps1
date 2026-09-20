param([string]$BaseUrl = 'http://localhost:3000')
$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.status -ne 'ok') { throw 'health failed' }
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body '{"username":"admin","password":"admin"}'
$authHeaders = @{ Authorization = "Bearer $($login.token)" }
$authenticatedSession = Invoke-RestMethod "$BaseUrl/api/session" -Headers $authHeaders
if ($authenticatedSession.user.role -ne 'admin' -or $authenticatedSession.permissions -notcontains 'finance') { throw 'authenticated role session failed' }
$staffLoginName = "smoke_$(Get-Date -Format 'HHmmss')"
$createdStaff = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -ContentType 'application/json' -Body (@{ name = 'Smoke bartender'; login = $staffLoginName; password = 'smoke-pass'; role = 'bartender' } | ConvertTo-Json)
if ($createdStaff.login -ne $staffLoginName) { throw 'staff creation failed' }
$staffAuth = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body (@{ username = $staffLoginName; password = 'smoke-pass' } | ConvertTo-Json)
if ($staffAuth.user.role -ne 'bartender') { throw 'created staff login failed' }
$shift = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/shifts" -ContentType 'application/json' -Body '{"openingCash":1000}'
if (-not $shift.id) { throw 'shift open failed' }
$closedShift = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/shifts/$($shift.id)/close" -ContentType 'application/json' -Body '{"closingCash":1200}'
if (-not $closedShift.closedAt -or $closedShift.closingCash -ne 1200) { throw 'shift close failed' }
$owner = Invoke-RestMethod "$BaseUrl/api/session?role=owner"
if ($owner.permissions -notcontains 'staff' -or $owner.permissions -notcontains 'finance') { throw 'owner permissions failed' }
$session = Invoke-RestMethod "$BaseUrl/api/session?role=bartender"
if ($session.permissions -notcontains 'orders' -or $session.permissions -contains 'finance') { throw 'role permissions failed' }
$products = Invoke-RestMethod "$BaseUrl/api/products"
$redbull = $products.items | Where-Object id -eq 'redbull'
if (-not $redbull.aliases -or $redbull.aliases.Count -lt 3) { throw 'aliases failed' }
$integrations = Invoke-RestMethod "$BaseUrl/api/integrations"
if (-not $integrations.egais -or $integrations.egais.enabled) { throw 'integration flags failed' }
$order = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-1","orderType":"vip","minimumOrderTotal":1500}'
$closed = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/close" -ContentType 'application/json' -Body '{}'
if ($closed.finalTotal -ne 1500 -or $closed.minimumAdjustment -ne 1500) { throw 'vip minimum failed' }
$vip2 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-2","orderType":"vip","minimumOrderTotal":2500}'
$vip2Closed = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($vip2.id)/close" -ContentType 'application/json' -Body '{}'
if ($vip2Closed.finalTotal -ne 2500 -or $vip2Closed.minimumAdjustment -ne 2500) { throw 'vip room 2 minimum failed' }
$paymentOrder = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-1","minimumOrderTotal":1500}'
$payment = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($paymentOrder.id)/payments" -ContentType 'application/json' -Body '{"method":"card","amount":1000}'
if ($payment.remaining -ne 500 -or $payment.closed) { throw 'partial payment failed' }
$paymentFinal = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($paymentOrder.id)/payments" -ContentType 'application/json' -Body '{"method":"qr","amount":500}'
if ($paymentFinal.remaining -ne 0 -or -not $paymentFinal.closed) { throw 'split payment completion failed' }

$regular = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"table-1"}'
$guest = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($regular.id)" -ContentType 'application/json' -Body '{"guestName":"Smoke guest","phone":"+79990000000"}'
if ($guest.guestName -ne 'Smoke guest') { throw 'guest binding failed' }
$item = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($regular.id)/items" -ContentType 'application/json' -Body '{"productId":"redbull","quantity":1}'
$split = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($regular.id)/split" -ContentType 'application/json' -Body "{`"itemIds`":[`"$($item.id)`"]}"
if (-not $split.splitFrom) { throw 'split failed' }
$discount = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($split.id)/discount-requests" -ContentType 'application/json' -Body '{"type":"percent","value":10,"reason":"guest promo","requestedBy":"u-test"}'
if ($discount.status -ne 'requested') { throw 'discount request failed' }
$decision = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/discount-requests/$($discount.id)/approve" -ContentType 'application/json' -Body '{"decidedBy":"owner"}'
if ($decision.status -ne 'approved') { throw 'discount approval failed' }
$metrics = Invoke-RestMethod "$BaseUrl/api/metrics"
if ($null -eq $metrics.staffActive) { throw 'metrics failed' }
$inventory = Invoke-RestMethod "$BaseUrl/api/inventory"
if (-not $inventory.items -or $null -eq $inventory.lowStock) { throw 'inventory endpoint failed' }
$movement = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/inventory/movements" -ContentType 'application/json' -Body '{"itemId":"ing-redbull","delta":1,"reason":"smoke test"}'
if ($movement.delta -ne 1) { throw 'inventory movement failed' }
$reservation = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body '{"guestName":"Smoke test","date":"2026-09-16","time":"23:00","tableId":"table-12","guests":2}'
if ($reservation.status -ne 'confirmed') { throw 'reservation create failed' }
$vipReservationStatus = $null
try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body '{"guestName":"VIP smoke","date":"2026-09-16","time":"23:30","tableId":"vip-room-1","guests":2,"deposit":0}' | Out-Null } catch { $vipReservationStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($vipReservationStatus -ne 409) { throw 'VIP reservation deposit guard failed' }
$vipReservation = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body '{"guestName":"VIP smoke","date":"2026-09-16","time":"23:30","tableId":"vip-room-1","guests":2,"deposit":1500}'
if ($vipReservation.deposit -ne 1500) { throw 'VIP reservation deposit create failed' }
$finance = Invoke-RestMethod "$BaseUrl/api/finance/summary"
if ($null -eq $finance.revenue -or $null -eq $finance.byPaymentMethod) { throw 'finance summary failed' }
$audit = Invoke-RestMethod "$BaseUrl/api/audit"
if (-not $audit.items -or $audit.items.Count -lt 1) { throw 'audit failed' }
Write-Output 'CRM smoke test: PASS'

