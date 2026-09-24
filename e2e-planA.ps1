$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$pass = 0; $fail = 0
function Check($name, $cond) {
  if ($cond) { Write-Host "PASS: $name"; $script:pass++ }
  else { Write-Host "FAIL: $name"; $script:fail++ }
}
function Api($method, $path, $body, $token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  $uri = "$base$path"
  if ($body -ne $null) {
    $json = $body | ConvertTo-Json -Depth 8
    return Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body $json
  }
  return Invoke-RestMethod -Uri $uri -Method $method -Headers $headers
}

$login = Api "POST" "/auth/login" @{ email = "demo@summitokr.com"; password = "password123" } $null
$token = $login.data.accessToken

# 1. create vision -> auto root group
$v = (Api "POST" "/visions" @{ content = "E2E-Vision-PlanA"; startAge = 20; endAge = 40 } $token).data
Check "A1: vision created" ($null -ne $v.id)
$tree = (Api "GET" "/goal-groups?includeObjectives=true" $null $token).data
$root = @($tree | Where-Object { $_.visionId -eq $v.id })
Check "A2: auto root group created with visionId" ($root.Count -ge 1)
Check "A3: root group has vision object" ($null -ne $root[0].vision -and $root[0].vision.id -eq $v.id)
$rootId = $root[0].id

# 2. create child group under root (no visionId allowed on children)
$child = (Api "POST" "/goal-groups" @{ name = "E2E-ChildA"; parentId = $rootId } $token).data
Check "A4: child group created" ($null -ne $child.id -and $child.visionId -eq $null)

# 3. create objective in child group
$obj = (Api "POST" "/objectives" @{ goalGroupId = $child.id; title = "E2E-ObjA"; color = "#409EFF" } $token).data
Check "A5: objective created (no visionId field)" ($null -ne $obj.id)

# 4. vision list derives objective through tree
$visions = (Api "GET" "/visions" $null $token).data
$mv = @($visions | Where-Object { $_.id -eq $v.id })[0]
Check "A6: vision objectives derived via tree" (@($mv.objectives | Where-Object { $_.id -eq $obj.id }).Count -eq 1)

# 5. create KR + check progress not NaN
$kr = (Api "POST" "/key-results" @{ objectiveId = $obj.id; title = "E2E-KRA"; initialValue = 0; targetValue = 10 } $token).data
Check "A7: KR created" ($null -ne $kr.id)
$visions2 = (Api "GET" "/visions" $null $token).data
$mv2 = @($visions2 | Where-Object { $_.id -eq $v.id })[0]
Check "A8: progress is number" ($mv2.progress -is [double] -or $mv2.progress -is [int])

# 6. delete vision -> root group survives, detached
Api "DELETE" "/visions/$($v.id)" $null $token | Out-Null
$tree2 = (Api "GET" "/goal-groups" $null $token).data
$root2 = @($tree2 | Where-Object { $_.id -eq $rootId })
Check "A9: root group kept after vision delete" ($root2.Count -eq 1 -and $root2[0].visionId -eq $null)
$objs2 = (Api "GET" "/objectives?goalGroupId=$($child.id)" $null $token).data
Check "A10: objective kept" (@($objs2.list | Where-Object { $_.id -eq $obj.id }).Count -eq 1)

# 7. cleanup
Api "DELETE" "/goal-groups/$rootId" $null $token | Out-Null
$tree3 = (Api "GET" "/goal-groups" $null $token).data
Check "A11: cleanup cascade delete ok" (@($tree3 | Where-Object { $_.id -eq $rootId }).Count -eq 0)

Write-Host ""
Write-Host "RESULT: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }
