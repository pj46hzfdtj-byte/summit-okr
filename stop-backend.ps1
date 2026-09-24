$owners = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($owners) {
  foreach ($o in ($owners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    Stop-Process -Id $o -Force -ErrorAction SilentlyContinue
    Write-Host "killed $o"
  }
} else { Write-Host "no listener" }
Start-Sleep -Seconds 2
$still = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($still) { Write-Host "STILL HELD" } else { Write-Host "port 3001 free" }
