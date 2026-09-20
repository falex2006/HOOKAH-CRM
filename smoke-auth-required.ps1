param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$OwnerUser = 'owner',
  [string]$OwnerPassword = $env:DEMO_OWNER_PASSWORD,
  [string]$StaffLogin = "acceptance_staff_$(Get-Date -Format 'HHmmss')",
  [string]$DeveloperLogin = "acceptance_dev_$(Get-Date -Format 'HHmmss')"
)
$ErrorActionPreference = 'Stop'
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
$staff = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ name = 'Acceptance bartender'; login = $StaffLogin; password = 'acceptance-pass'; role = 'bartender' } | ConvertTo-Json)
$developer = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/staff" -Headers $ownerHeaders -ContentType 'application/json' -Body (@{ name = 'Acceptance developer'; login = $DeveloperLogin; password = 'acceptance-pass'; role = 'developer' } | ConvertTo-Json)
$staffAuth = Login $StaffLogin 'acceptance-pass'
$developerAuth = Login $DeveloperLogin 'acceptance-pass'
$staffHeaders = HeadersFor $staffAuth
$developerHeaders = HeadersFor $developerAuth
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/finance/summary" -Headers $staffHeaders }) -ne 403) { throw 'bartender finance access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/inventory" -Headers $staffHeaders }) -ne 403) { throw 'bartender inventory access should be denied' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/finance/summary" -Headers $developerHeaders }) -ne 200) { throw 'developer finance read should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/inventory" -Headers $developerHeaders }) -ne 200) { throw 'developer inventory read should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/staff" -Headers $developerHeaders }) -ne 200) { throw 'developer staff access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/reservations" -Headers $developerHeaders }) -ne 200) { throw 'developer reservations access should be allowed' }
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/floor" -Headers $developerHeaders }) -ne 200) { throw 'developer floor access should be allowed' }
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/logout" -Headers $staffHeaders | Out-Null
if ((StatusFor { Invoke-RestMethod "$BaseUrl/api/session" -Headers $staffHeaders }) -ne 401) { throw 'logout should revoke the staff session' }
Write-Output 'AUTH_REQUIRED role test: PASS'
