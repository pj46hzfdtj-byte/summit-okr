$ErrorActionPreference = "Continue"
$base = "http://localhost:3001/api"
$pass = 0; $fail = 0

function Check($name, $cond) {
  if ($cond) { Write-Host "PASS: $name"; $script:pass++ }
  else { Write-Host "FAIL: $name"; $script:fail++ }
}

function Api($method, $path, $body, $token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  $json = $null
  if ($body) { $json = ($body | ConvertTo-Json -Depth 6) }
  try {
    $resp = Invoke-RestMethod -Uri "$base$path" -Method $method -Headers $headers -Body $json -TimeoutSec 15
    return $resp
  } catch {
    return @{ __error = $_.Exception.Message }
  }
}

# 1. login
$login = Api "POST" "/auth/login" @{ email = "demo@summitokr.com"; password = "password123" }
$token = $login.data.accessToken
Check "login" ($token -ne $null)

# 2. /health (no auth)
$h = Api "GET" "/health" $null $null
Check "health endpoint" ($h.data.status -eq "ok" -and $h.data.db -eq "ok")

# 3. checkin status with tz + streak
$st = Api "GET" "/checkins/status?tz=480" $null $token
if ($st.__error) { Write-Host "  status err: $($st.__error)" }
Check "checkin status has streak field" ($st.data.streak -ne $null)
Check "checkin weekStart tz+8 (T16:00:00Z)" ($st.data.weekStart -match "T16:00:00")

# 4. checkin upsert
$ci = Api "PUT" "/checkins/this-week?tz=480" @{ note = "e2e test" } $token
Check "checkin upsert" ($ci.data.id -ne $null)
$st2 = Api "GET" "/checkins/status?tz=480" $null $token
Check "checkin done=true after upsert" ($st2.data.done -eq $true)
Check "checkin streak>=1 after upsert" ($st2.data.streak -ge 1)

# 5. user settings: notif prefs
$set1 = Api "GET" "/users/me/settings" $null $token
Check "get settings default all-on" ($set1.data.notifPrefs.stale_kr -eq $true)
$set2 = Api "PUT" "/users/me/settings" @{ notifPrefs = @{ stale_kr = $false } } $token
if ($set2.__error) { Write-Host "  put settings err: $($set2.__error)" }
Check "update pref stale_kr=false" ($set2.data.notifPrefs.stale_kr -eq $false)
$set3 = Api "GET" "/users/me/settings" $null $token
Check "pref persisted" ($set3.data.notifPrefs.stale_kr -eq $false)
Api "PUT" "/users/me/settings" @{ notifPrefs = @{ stale_kr = $true } } $token | Out-Null

# 6. notifications list
$nt = Api "GET" "/notifications" $null $token
Check "notifications list" ($nt.data.list -ne $null)

# ===== P0 soft-delete leak tests =====
$grp = Api "POST" "/goal-groups" @{ name = "E2E-Node" } $token
$grpId = $grp.data.id
$obj = Api "POST" "/objectives" @{ title = "E2E-Obj"; goalGroupId = $grpId; color = "#409EFF" } $token
$objId = $obj.data.id
$kr = Api "POST" "/key-results" @{ objectiveId = $objId; title = "E2E-KR"; initialValue = 0; targetValue = 10 } $token
$krId = $kr.data.id
Check "setup: group+objective+kr created" ($grpId -ne $null -and $objId -ne $null -and $krId -ne $null)

# delete objective -> KR cascade soft-deleted
Api "DELETE" "/objectives/$objId" $null $token | Out-Null
$recycle = Api "GET" "/recycle" $null $token
$krInBin = @($recycle.data | Where-Object { $_.id -eq $krId -and $_.entityType -eq "key_result" })
Check "P1: delete objective cascades KR to bin" ($krInBin.Count -ge 1)

# P0: cannot create review on deleted objective
$rv = Api "POST" "/reviews" @{ objectiveId = $objId; type = "midterm"; krScores = @(); selfRating = 50 } $token
Check "P0: review blocked on deleted objective" ($rv.__error -ne $null)

# P0: cannot add record to deleted KR
$rc = Api "POST" "/records" @{ keyResultId = $krId; value = 5 } $token
Check "P0: record blocked on deleted KR" ($rc.__error -ne $null)

# P0: export excludes deleted data, includes new tables
$exp = Api "GET" "/data/export" $null $token
$expObjIds = @($exp.objectives | ForEach-Object { $_.id })
Check "P0: export excludes deleted objective" (-not ($expObjIds -contains $objId))
Check "export has checkIns" ($exp.checkIns -ne $null)
Check "export has notifications" ($exp.notifications -ne $null)
Check "export version 1.1" ($exp.version -eq "1.1")

# P1: cascade restore
Api "POST" "/recycle/restore" @{ entityType = "objective"; id = $objId } $token | Out-Null
$recycle2 = Api "GET" "/recycle" $null $token
$krStillInBin = @($recycle2.data | Where-Object { $_.id -eq $krId })
Check "P1: restore objective cascades KR restore" ($krStillInBin.Count -eq 0)

# record works after restore
$rc2 = Api "POST" "/records" @{ keyResultId = $krId; value = 3 } $token
Check "record works after restore" ($rc2.data.id -ne $null)

# ===== P2 gantt confidence =====
Api "PATCH" "/key-results/$krId" @{ confidence = "at_risk" } $token | Out-Null
Api "PATCH" "/objectives/$objId" @{ startAt = "2026-09-01T00:00:00.000Z"; endAt = "2026-09-30T00:00:00.000Z" } $token | Out-Null
$gantt = Api "GET" "/gantt" $null $token
$gItem = @($gantt.data.items | Where-Object { $_.id -eq $objId })
if ($gItem.Count -eq 0) { Write-Host "  gantt item not found; items=$($gantt.data.items.Count)" }
Check "P2: gantt worstConfidence=at_risk" ($gItem.Count -ge 1 -and $gItem[0].worstConfidence -eq "at_risk")

# ===== cleanup =====
Api "DELETE" "/records/$($rc2.data.id)" $null $token | Out-Null
Api "DELETE" "/objectives/$objId" $null $token | Out-Null
Api "POST" "/recycle/destroy" @{ entityType = "objective"; id = $objId } $token | Out-Null
Api "DELETE" "/goal-groups/$grpId" $null $token | Out-Null

Write-Host ""
Write-Host "===== RESULT: $pass passed, $fail failed ====="
