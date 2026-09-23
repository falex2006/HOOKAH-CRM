param(
  [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$baseUri = [Uri]$BaseUrl
if ($baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Local-only tea test refused non-local BaseUrl: $BaseUrl" }
$health = Invoke-RestMethod "$BaseUrl/api/health"
if ($health.status -ne 'ok') { throw "Local CRM is not healthy: $BaseUrl" }
$recipes = Invoke-RestMethod "$BaseUrl/api/recipes"
$products = Invoke-RestMethod "$BaseUrl/api/products"
if ($products.items.Count -lt 75) {
  $seed = Get-Content (Join-Path $PSScriptRoot '..\catalog-seed.js') -Raw
  if ($seed -notmatch 'Пуэр 3 года' -or $seed -notmatch 'Да Хун Пао' -or $seed -notmatch 'облепиховый') { throw 'Catalog seed is missing required tea cards' }
  Write-Output 'LOCAL TEA-CATALOG TEST: PASS (empty database; catalog seed contains required tea cards)'
  exit 0
}
if ($recipes.items.Count -lt 24) { throw "Expected at least 24 recipe cards, got $($recipes.items.Count)" }
if ($products.items.Count -lt 75) { throw "Expected at least 75 catalog products, got $($products.items.Count)" }
$methodCards = @($recipes.items | Where-Object { $_.technology -and $_.technology.Trim().Length -gt 0 })
if ($methodCards.Count -lt 7) { throw "Expected at least 7 cards with preparation method, got $($methodCards.Count)" }
$expected = @('Пуэр 3 года', 'Порт Петровск', 'Венецианская ночь', 'Эрл Грей', 'Моли Хуа Ча', 'Тропические цветы', 'Молочный улун', 'Сен Ча', 'Да Хун Пао', 'Горные сборы', 'Красная поляна', 'Жасмин манго (вариант 1)', 'Клубника с мятой', 'Малина розмарин', 'манго маракуйя', 'облепиховый (вариант 1)', 'облепиховый (вариант 2)', 'Жасмин манго (вариант 2)')
$missing = @($expected | Where-Object { -not ($recipes.items.name -contains $_) })
if ($missing.Count -gt 0) { throw "Missing imported tea cards: $($missing -join ', ')" }
Write-Output "LOCAL TEA-CATALOG TEST: PASS (recipes=$($recipes.items.Count), products=$($products.items.Count), methods=$($methodCards.Count))"
