param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$OwnerUser = 'owner',
  [string]$OwnerPassword = $env:DEMO_OWNER_PASSWORD,
  [string]$AdminPassword = $(if ($env:DEMO_ADMIN_PASSWORD) { $env:DEMO_ADMIN_PASSWORD } else { 'admin' }),
  [string]$StaffLogin = "acceptance_staff_$(Get-Date -Format 'HHmmss')",
  [string]$DeveloperLogin = "acceptance_dev_$(Get-Date -Format 'HHmmss')"
)
$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only auth test refused non-local BaseUrl: $BaseUrl" }
if (-not $OwnerPassword) { throw 'Set DEMO_OWNER_PASSWORD or pass -OwnerPassword before running against AUTH_REQUIRED=true' }
function Login([string]$Username, [string]$Password) {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -ContentType 'application/json' -Body (@{ username = $Username; password = $Password } | ConvertTo-Json)
}
function HeadersFor($Auth) { @{ Authorization = "Bearer $($Auth.token)" } }
function StatusFor([scriptblock]$Call) {
  try { & $Call | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode.value__ }
}
$owner = Login $OwnerUser $OwnerPassword
$ownerHeaders = HeadersFor $owner
$admin = Login 'admin' $AdminPassword
$adminHeaders = HeadersFor $admin
$manager = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $adminHeaders -ContentType 'application/json' -Body (@{ name = 'Managed manager'; login = "acceptance_manager_$(Get-Date -Format 'HHmmss')"; password = 'acceptance-pass'; role = 'bartender'; telegram = '@manager_demo'; phoneNumbers = @(@{ label = 'Рабочий'; number = '+7 900 000-00-01'; primary = $true }) } | ConvertTo-Json -Depth 5)
if (-not $manager.id) { throw 'manager staff creation should be allowed' }
$adminRoleStatus = StatusFor { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $adminHeaders -ContentType 'application/json' -Body (@{ name = 'Rejected developer'; login = "rejected_dev_$(Get-Date -Format 'HHmmss')"; password = 'acceptance-pass'; role = 'developer' } | ConvertTo-Json) }
$shortPasswordStatus = StatusFor { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $adminHeaders -ContentType 'application/json' -Body (@{ name = 'Rejected password'; login = "rejected_password_$(Get-Date -Format 'HHmmss')"; password = '123'; role = 'bartender' } | ConvertTo-Json) }
if ($shortPasswordStatus -ne 400) { throw 'short staff passwords must be rejected' }
if ($adminRoleStatus -ne 403) { throw 'manager must not assign developer role' }
$managerProfile = Invoke-RestMethod "$BaseUrl/api/staff/$($manager.id)/profile" -Headers $adminHeaders
if ($managerProfile.phoneNumbers.Count -ne 1 -or $managerProfile.telegram -ne '@manager_demo') { throw 'manager staff profile fields should be readable' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/staff" -Headers $adminHeaders }) -ne 200) { throw 'manager staff listing should be allowed' }
$ownerPatchStatus = StatusFor { Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/staff/u-owner/profile" -Headers $adminHeaders -ContentType 'application/json' -Body (@{ telegram = '@blocked_owner' } | ConvertTo-Json) }
if ($ownerPatchStatus -ne 403) { throw 'manager must not edit owner profile' }
$staffBody = @{ name = 'Acceptance bartender'; login = $StaffLogin; password = 'acceptance-pass'; role = 'bartender'; phoneNumbers = @(@{ label = 'Основной'; number = '+7 900 000-00-11'; primary = $true }, @{ label = 'Дополнительный'; number = '+7 900 000-00-12'; primary = $false }); telegram = '@acceptance_staff'; employmentStartedAt = '2026-01-15'; workNotes = 'local acceptance' }
if ($env:STAFF_PASSPORT_KEY) { $staffBody.passportData = @{ series = '0000'; number = '000000'; issuedBy = 'local smoke' } }
$staff = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body ($staffBody | ConvertTo-Json -Depth 5)
if ($staff.phoneNumbers.Count -ne 2 -or $staff.telegram -ne '@acceptance_staff' -or $staff.employmentStartedAt -ne '2026-01-15') { throw 'staff contact and HR fields failed' }
$staffProfileCheck = Invoke-RestMethod "$BaseUrl/api/staff/$($staff.id)/profile" -Headers $ownerHeaders
if ($env:STAFF_PASSPORT_KEY -and $staffProfileCheck.passportData.number -ne '000000') { throw 'staff passport data failed' }
$avatarData = 'data:image/png;base64,AA=='
$avatar = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff/$($staff.id)/avatar" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ imageData = $avatarData } | ConvertTo-Json)
if (-not $avatar.avatarUrl) { throw 'staff avatar update failed' }
$developer = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ name = 'Acceptance developer'; login = $DeveloperLogin; password = 'acceptance-pass'; role = 'developer' } | ConvertTo-Json)
$seniorBarLogin = "acceptance_senior_bar_$(Get-Date -Format 'HHmmss')"
$seniorBar = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ name = 'Acceptance senior bartender'; login = $seniorBarLogin; password = 'acceptance-pass'; role = 'senior_bartender' } | ConvertTo-Json)
$seniorHookahLogin = "acceptance_senior_hookah_$(Get-Date -Format 'HHmmss')"
$seniorHookah = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ name = 'Acceptance senior hookah'; login = $seniorHookahLogin; password = 'acceptance-pass'; role = 'senior_hookah_master' } | ConvertTo-Json)
$staffAuth = Login $StaffLogin 'acceptance-pass'
$developerAuth = Login $DeveloperLogin 'acceptance-pass'
$seniorBarAuth = Login $seniorBarLogin 'acceptance-pass'
$seniorHookahAuth = Login $seniorHookahLogin 'acceptance-pass'
$staffHeaders = HeadersFor $staffAuth
$developerHeaders = HeadersFor $developerAuth
$seniorBarHeaders = HeadersFor $seniorBarAuth
$seniorHookahHeaders = HeadersFor $seniorHookahAuth
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/finance/summary" -Headers $staffHeaders }) -ne 403) { throw 'bartender finance access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/inventory" -Headers $staffHeaders }) -ne 403) { throw 'bartender inventory access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/finance/summary" -Headers $seniorBarHeaders }) -ne 403) { throw 'senior bartender finance access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/inventory" -Headers $seniorHookahHeaders }) -ne 403) { throw 'senior hookah inventory access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/floor" -Headers $seniorBarHeaders }) -ne 200 -or (StatusFor { Invoke-RestMethod "$BaseUrl/api/floor" -Headers $seniorHookahHeaders }) -ne 200) { throw 'senior floor access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/finance/summary" -Headers $developerHeaders }) -ne 200) { throw 'developer finance read should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/inventory" -Headers $developerHeaders }) -ne 200) { throw 'developer inventory read should be allowed' }
$developerProductsStatus = StatusFor { Invoke-RestMethod "$BaseUrl/api/products" -Headers $developerHeaders }
if ($developerProductsStatus -ne 200) { throw 'developer product catalog read should be allowed' }
$developerMovementStatus = StatusFor { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/inventory/movements" -Headers $developerHeaders -ContentType 'application/json' -Body (@{ itemId = 'ing-redbull'; delta = 1; reason = 'developer read-only check' } | ConvertTo-Json) }
if ($developerMovementStatus -ne 403) { throw 'developer inventory write should be denied' }
$developerProductWriteStatus = StatusFor { Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/products" -Headers $developerHeaders -ContentType 'application/json' -Body (@{ name = 'Developer write check'; category = 'Бар'; price = 1 } | ConvertTo-Json) }
if ($developerProductWriteStatus -ne 403) { throw 'developer product write should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/staff" -Headers $developerHeaders }) -ne 200) { throw 'developer staff access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/reservations" -Headers $developerHeaders }) -ne 200) { throw 'developer reservations access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/floor" -Headers $developerHeaders }) -ne 200) { throw 'developer floor access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/network/venues" -Headers $developerHeaders }) -ne 200) { throw 'developer network read should be allowed' }
$adminNetworkStatus = StatusFor { Invoke-RestMethod "$BaseUrl/api/network/venues" -Headers $adminHeaders }
if ($adminNetworkStatus -ne 403) { throw 'manager network access should be restricted' }
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/logout" -Headers $staffHeaders | Out-Null
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/session" -Headers $staffHeaders }) -ne 401) { throw 'logout should revoke the staff session' }
$blocked = Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/staff/$($staff.id)/status" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ active = $false } | ConvertTo-Json)
if ($blocked.active -ne $false) { throw 'staff blocking failed' }
Write-Output 'AUTH_REQUIRED role test: PASS'
