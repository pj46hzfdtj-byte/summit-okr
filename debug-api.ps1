$base = "http://localhost:3001/api"

function ApiRaw($method, $path, $body, $token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  $json = $null
  if ($body) { $json = ($body | ConvertTo-Json -Depth 6) }
  try {
    $resp = Invoke-WebRequest -Uri "$base$path" -Method $method -Headers $headers -Body $json -TimeoutSec 15 -UseBasicParsing
    return "STATUS=$($resp.StatusCode) BODY=$($resp.Content)"
  } catch {
    $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errBody = $sr.ReadToEnd()
    return "STATUS=$($_.Exception.Response.StatusCode.value__) BODY=$errBody"
  }
}

$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body (@{ email = "demo@summitokr.com"; password = "password123" } | ConvertTo-Json)
$token = $login.data.accessToken

Write-Host "--- PUT settings ---"
ApiRaw "PUT" "/users/me/settings" @{ notifPrefs = @{ stale_kr = $false } } $token

Write-Host "--- POST goal-group ---"
ApiRaw "POST" "/goal-groups" @{ name = "E2E-Node" } $token

Write-Host "--- GET notifications ---"
ApiRaw "GET" "/notifications" $null $token
