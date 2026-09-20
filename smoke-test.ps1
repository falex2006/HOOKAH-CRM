param([string]$BaseUrl = 'http://localhost:3000')
$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only smoke test refused non-local BaseUrl: $BaseUrl" }
$smokeSuffix = (Get-Date).ToString('yyyyMMddHHmmss')
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.status -ne 'ok') { throw 'health failed' }
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body '{"username":"admin","password":"admin"}'
$authHeaders = @{ Authorization = "Bearer $($login.token)" }
$authenticatedSession = Invoke-RestMethod "$BaseUrl/api/session" -Headers $authHeaders
if ($authenticatedSession.user.role -ne 'admin' -or $authenticatedSession.permissions -notcontains 'finance') { throw 'authenticated role session failed' }
$staffLoginName = "smoke_$(Get-Date -Format 'HHmmss')"
$createdStaff = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -ContentType 'application/json' -Body (@{ name = 'Smoke bartender'; login = $staffLoginName; password = 'smoke-pass'; role = 'bartender'; employmentStartedAt = '2026-01-15'; workNotes = 'smoke'; phoneNumbers = @(@{ label = 'Рабочий'; number = '+79990001111'; primary = $true }) } | ConvertTo-Json -Depth 5)
if ($createdStaff.login -ne $staffLoginName) { throw 'staff creation failed' }
if ($createdStaff.employmentStartedAt -ne '2026-01-15' -or $createdStaff.phoneNumbers.Count -ne 1) { throw 'staff employment/contact fields failed' }
$staffAuth = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body (@{ username = $staffLoginName; password = 'smoke-pass' } | ConvertTo-Json)
if ($staffAuth.user.role -ne 'bartender') { throw 'created staff login failed' }
$staffProfile = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/staff/$($createdStaff.id)/profile" -ContentType 'application/json' -Body (@{ name = 'Smoke senior bartender'; role = 'senior_bartender'; workNotes = 'updated' } | ConvertTo-Json)
if ($staffProfile.role -ne 'senior_bartender' -or $staffProfile.name -ne 'Smoke senior bartender') { throw 'staff role update failed' }
$shift = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/shifts" -ContentType 'application/json' -Body '{"openingCash":1000}'
if (-not $shift.id) { throw 'shift open failed' }
$closedShift = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/shifts/$($shift.id)/close" -ContentType 'application/json' -Body '{"closingCash":1200}'
if (-not $closedShift.closedAt -or $closedShift.closingCash -ne 1200) { throw 'shift close failed' }
$owner = Invoke-RestMethod "$BaseUrl/api/session?role=owner"
if ($owner.permissions -notcontains 'staff' -or $owner.permissions -notcontains 'finance') { throw 'owner permissions failed' }
$venueBefore = Invoke-RestMethod "$BaseUrl/api/venue"
$venueUpdated = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/venue" -ContentType 'application/json' -Body (@{ phone = '+7 (900) 123-45-67'; logoUrl = 'data:image/png;base64,AA=='; vipRoomMinimums = @{ vip_room_1 = 1600; vip_room_2 = 2600 } } | ConvertTo-Json)
if ($venueUpdated.phone -ne '+7 (900) 123-45-67' -or $venueUpdated.vipRoomMinimums.vip_room_1 -ne 1600 -or -not $venueUpdated.logoUrl) { throw 'company settings update failed' }
$restorePhone = if ([string]$venueBefore.phone -match '^\+?[0-9 ()-]{7,24}$') { [string]$venueBefore.phone } else { '+7 (996) 641-95-10' }
Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/venue" -ContentType 'application/json' -Body (@{ phone = $restorePhone; logoUrl = $venueBefore.logoUrl; vipRoomMinimums = @{ vip_room_1 = 1500; vip_room_2 = 2500 } } | ConvertTo-Json) | Out-Null
$session = Invoke-RestMethod "$BaseUrl/api/session?role=bartender"
if ($session.permissions -notcontains 'orders' -or $session.permissions -contains 'finance') { throw 'role permissions failed' }
$products = Invoke-RestMethod "$BaseUrl/api/products"
$redbull = $products.items | Where-Object id -eq 'redbull'
if (-not $redbull.aliases -or $redbull.aliases.Count -lt 3) { throw 'aliases failed' }
$product = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/products" -ContentType 'application/json' -Body (@{ name = "Smoke product $smokeSuffix"; category = 'Бар'; price = 399; aliases = @('smoke', 'тест') } | ConvertTo-Json)
if (-not $product.id -or $product.category -ne 'Бар') { throw 'product create failed' }
$productUpdated = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/products/$($product.id)" -ContentType 'application/json' -Body (@{ price = 420; aliases = @('smoke', 'обновлённый') } | ConvertTo-Json)
if ($productUpdated.price -ne 420) { throw 'product update failed' }
$productImage = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/products/$($product.id)/image" -ContentType 'application/json' -Body (@{ imageData = 'data:image/png;base64,AA==' } | ConvertTo-Json)
if (-not $productImage.imageUrl) { throw 'product image update failed' }
$productDeleted = Invoke-RestMethod -Method Delete -Uri "$BaseUrl/api/products/$($product.id)"
if ($productDeleted.active -ne $false) { throw 'product deactivation failed' }
$productCategories = Invoke-RestMethod "$BaseUrl/api/product-categories"
if ($productCategories.items.Count -lt 1) { throw 'product categories list failed' }
$productCategory = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/product-categories" -ContentType 'application/json' -Body (@{ name = "Smoke product category $smokeSuffix" } | ConvertTo-Json)
$productCategoryUpdated = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/product-categories/$($productCategory.id)" -ContentType 'application/json' -Body (@{ name = "Smoke product category updated $smokeSuffix" } | ConvertTo-Json)
if ($productCategoryUpdated.name -notlike '*updated*') { throw 'product category update failed' }
$productCategoryDeleted = Invoke-RestMethod -Method Delete -Uri "$BaseUrl/api/product-categories/$($productCategory.id)"
if ($productCategoryDeleted.active -ne $false) { throw 'product category deactivation failed' }
$networkBefore = Invoke-RestMethod "$BaseUrl/api/network/venues"
if ($networkBefore.items.Count -lt 1) { throw 'network venues list failed' }
$networkVenue = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/network/venues" -ContentType 'application/json' -Body (@{ name = "Smoke point $smokeSuffix"; city = 'Тюмень'; address = "ул. Smoke $smokeSuffix" } | ConvertTo-Json)
$networkUpdated = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/network/venues/$($networkVenue.id)" -ContentType 'application/json' -Body (@{ name = "Smoke point updated $smokeSuffix" } | ConvertTo-Json)
if ($networkUpdated.name -notlike '*updated*') { throw 'network venue update failed' }
$networkSelected = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/network/venues/$($networkVenue.id)/select"
if (-not $networkSelected.isCurrent) { throw 'network venue select failed' }
$networkCurrentDeleteStatus = $null
try { Invoke-RestMethod -Method Delete -Uri "$BaseUrl/api/network/venues/$($networkVenue.id)" | Out-Null } catch { $networkCurrentDeleteStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($networkCurrentDeleteStatus -ne 409) { throw 'current network venue archive guard failed' }
$financeCategories = Invoke-RestMethod "$BaseUrl/api/finance/categories"
if ($financeCategories.items.Count -lt 1) { throw 'finance categories list failed' }
$financeCategory = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/finance/categories" -ContentType 'application/json' -Body (@{ name = "Smoke category $smokeSuffix"; kind = 'expense' } | ConvertTo-Json)
$financeCategoryUpdated = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/finance/categories/$($financeCategory.id)" -ContentType 'application/json' -Body (@{ name = "Smoke category updated $smokeSuffix" } | ConvertTo-Json)
if ($financeCategoryUpdated.name -notlike '*updated*') { throw 'finance category update failed' }
$financeCategoryDeleted = Invoke-RestMethod -Method Delete -Uri "$BaseUrl/api/finance/categories/$($financeCategory.id)"
if ($financeCategoryDeleted.active -ne $false) { throw 'finance category deactivation failed' }
$integrations = Invoke-RestMethod "$BaseUrl/api/integrations"
if (-not $integrations.egais -or $integrations.egais.enabled) { throw 'integration flags failed' }
$order = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-1","orderType":"vip","minimumOrderTotal":1500}'
$closed = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/close" -ContentType 'application/json' -Body '{}'
if ($closed.finalTotal -ne 1500 -or $closed.minimumAdjustment -ne 1500) { throw 'vip minimum failed' }
$closedAgainStatus = $null
try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($order.id)/close" -ContentType 'application/json' -Body '{}' | Out-Null } catch { $closedAgainStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($closedAgainStatus -ne 409) { throw 'closed order repeat guard failed' }
$vip2 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-2","orderType":"vip","minimumOrderTotal":2500}'
$vip2Closed = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($vip2.id)/close" -ContentType 'application/json' -Body '{}'
if ($vip2Closed.finalTotal -ne 2500 -or $vip2Closed.minimumAdjustment -ne 2500) { throw 'vip room 2 minimum failed' }
$paymentOrder = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body '{"tableId":"vip-room-1","minimumOrderTotal":1500}'
$payment = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($paymentOrder.id)/payments" -ContentType 'application/json' -Body '{"method":"card","amount":1000}'
if ($payment.remaining -ne 500 -or $payment.closed) { throw 'partial payment failed' }
$paymentFinal = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($paymentOrder.id)/payments" -ContentType 'application/json' -Body '{"method":"qr","amount":500}'
if ($paymentFinal.remaining -ne 0 -or -not $paymentFinal.closed) { throw 'split payment completion failed' }

$regular = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders" -ContentType 'application/json' -Body (@{ tableId = "smoke-table-$smokeSuffix" } | ConvertTo-Json)
$guest = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/orders/$($regular.id)" -ContentType 'application/json' -Body '{"guestName":"Smoke guest","phone":"+79990000000"}'
if ($guest.guestName -ne 'Smoke guest') { throw 'guest binding failed' }
$item = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($regular.id)/items" -ContentType 'application/json' -Body '{"productId":"redbull","quantity":1}'
$itemMerged = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($regular.id)/items" -ContentType 'application/json' -Body '{"productId":"redbull","quantity":1}'
if ($itemMerged.id -ne $item.id -or $itemMerged.quantity -ne 2) { throw 'duplicate product quantity merge failed' }
$split = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($regular.id)/split" -ContentType 'application/json' -Body "{`"itemIds`":[`"$($item.id)`"]}"
if (-not $split.splitFrom) { throw 'split failed' }
$discount = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($split.id)/discount-requests" -ContentType 'application/json' -Body '{"type":"percent","value":10,"reason":"guest promo","requestedBy":"u-test"}'
if ($discount.status -ne 'requested') { throw 'discount request failed' }
$invalidDiscountStatus = $null
try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/orders/$($split.id)/discount-requests" -ContentType 'application/json' -Body '{"type":"percent","value":101,"reason":"invalid"}' | Out-Null } catch { $invalidDiscountStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($invalidDiscountStatus -ne 400) { throw 'discount bounds guard failed' }
$decision = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/discount-requests/$($discount.id)/approve" -ContentType 'application/json' -Body '{"decidedBy":"owner"}'
if ($decision.status -ne 'approved') { throw 'discount approval failed' }
$metrics = Invoke-RestMethod "$BaseUrl/api/metrics"
if ($null -eq $metrics.staffActive) { throw 'metrics failed' }
$inventory = Invoke-RestMethod "$BaseUrl/api/inventory"
if (-not $inventory.items -or $null -eq $inventory.lowStock) { throw 'inventory endpoint failed' }
$movement = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/inventory/movements" -ContentType 'application/json' -Body '{"itemId":"ing-redbull","delta":1,"reason":"smoke test"}'
if ($movement.delta -ne 1) { throw 'inventory movement failed' }
# Always schedule smoke reservations for tomorrow so the test remains valid
# when it is run late in the evening or around a timezone boundary.
$smokeDate = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
$regularTime = "22:$((Get-Random -Minimum 10 -Maximum 59).ToString('00'))"
$regularReservationBody = @{ guestName = 'Smoke test'; date = $smokeDate; time = $regularTime; tableId = 'table-12'; guests = 2 } | ConvertTo-Json
$reservation = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body $regularReservationBody
if ($reservation.status -ne 'confirmed') { throw 'reservation create failed' }
$vipTime = "23:$((Get-Random -Minimum 10 -Maximum 59).ToString('00'))"
$vipLowBody = @{ guestName = 'VIP smoke'; date = $smokeDate; time = $vipTime; tableId = 'vip-room-1'; guests = 2; deposit = 0 } | ConvertTo-Json
$vipReservationStatus = $null
try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body $vipLowBody | Out-Null } catch { $vipReservationStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($vipReservationStatus -ne 409) { throw 'VIP reservation deposit guard failed' }
$vipBody = @{ guestName = 'VIP smoke'; date = $smokeDate; time = $vipTime; tableId = 'vip-room-1'; guests = 2; deposit = 1500 } | ConvertTo-Json
$vipReservation = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body $vipBody
if ($vipReservation.deposit -ne 1500) { throw 'VIP reservation deposit create failed' }
$duplicateStatus = $null
try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/reservations" -ContentType 'application/json' -Body $vipBody | Out-Null } catch { $duplicateStatus = [int]$_.Exception.Response.StatusCode.value__ }
if ($duplicateStatus -ne 409) { throw 'reservation conflict guard failed' }
$finance = Invoke-RestMethod "$BaseUrl/api/finance/summary"
if ($null -eq $finance.revenue -or $null -eq $finance.byPaymentMethod) { throw 'finance summary failed' }
$xReport = Invoke-RestMethod "$BaseUrl/api/finance/report?type=x"
$waiterReport = Invoke-RestMethod "$BaseUrl/api/finance/report?type=waiter"
if ($xReport.type -ne 'x' -or $null -eq $xReport.reportNumber -or $null -eq $xReport.byPaymentMethod) { throw 'X report failed' }
if ($waiterReport.type -ne 'waiter' -or $null -eq $waiterReport.byStaff) { throw 'waiter report failed' }
$audit = Invoke-RestMethod "$BaseUrl/api/audit"
if (-not $audit.items -or $audit.items.Count -lt 1) { throw 'audit failed' }
if (-not ($audit.items | Where-Object { $_.action -eq 'finance.report_generated' })) { throw 'report audit failed' }
Write-Output 'CRM smoke test: PASS'
