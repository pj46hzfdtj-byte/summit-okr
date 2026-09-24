# Summit OKR 运行模式切换脚本
# 用法:
#   .\switch-mode.ps1 docker  - Docker PostgreSQL 模式
#   .\switch-mode.ps1 local   - SQLite 本地模式（无需 Docker）
param([Parameter(Position=0)][ValidateSet("docker","local")][string]$Mode = "local")
$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $backendDir ".env"
$schemaFile = Join-Path $backendDir "prisma\schema.prisma"

function Write-FileNoBom($path, $content) {
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $content, $enc)
}

Write-Host "=== Switch to $Mode mode ===" -ForegroundColor Cyan

$envContent = Get-Content $envFile -Raw
$schemaContent = Get-Content $schemaFile -Raw

# 1. 更新 .env: DATABASE_URL + DB_MODE
if ($Mode -eq "docker") {
    $envContent = $envContent -replace "DATABASE_URL=.*", "DATABASE_URL=`"postgresql://summitokr:summitokr123@localhost:5432/summit_okr?schema=public`""
    if ($envContent -match "DB_MODE=") {
        $envContent = $envContent -replace "DB_MODE=.*", "DB_MODE=docker"
    } else {
        $envContent += "`nDB_MODE=docker"
    }
    # 恢复 schema: sqlite -> postgresql, String -> Json
    $schemaContent = $schemaContent -replace "provider = `"sqlite`"", "provider = `"postgresql`""
    $schemaContent = $schemaContent -replace "String(\s+@default\(`"\[\]`"\))", "Json`$1"
    $schemaContent = $schemaContent -replace "String(\s+@default\(`"\{\}`"\))", "Json`$1"
    $schemaContent = $schemaContent -replace "(krScores\s+)String", "`${1}Json"
    Write-Host "DB: PostgreSQL (Docker localhost:5432)" -ForegroundColor Green
} else {
    $envContent = $envContent -replace "DATABASE_URL=.*", "DATABASE_URL=`"file:./dev.db`""
    if ($envContent -match "DB_MODE=") {
        $envContent = $envContent -replace "DB_MODE=.*", "DB_MODE=local"
    } else {
        $envContent += "`nDB_MODE=local"
    }
    # 转换 schema: postgresql -> sqlite, Json -> String
    $schemaContent = $schemaContent -replace "provider = `"postgresql`"", "provider = `"sqlite`""
    $schemaContent = $schemaContent -replace "Json", "String"
    Write-Host "DB: SQLite (local file dev.db)" -ForegroundColor Green
}

Write-FileNoBom $envFile $envContent
Write-FileNoBom $schemaFile $schemaContent

# 2. 重新生成 Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
Push-Location $backendDir
npx prisma generate
if ($LASTEXITCODE -ne 0) { Write-Host "Prisma generate FAILED!" -ForegroundColor Red; Pop-Location; exit 1 }

# 3. 推送 schema 到数据库
Write-Host "Pushing schema to database..." -ForegroundColor Yellow
npx prisma db push --accept-data-loss
if ($LASTEXITCODE -ne 0) { Write-Host "db push FAILED!" -ForegroundColor Red; Pop-Location; exit 1 }

# 4. 本地模式下初始化种子数据
if ($Mode -eq "local") {
    $dbPath = Join-Path $backendDir "prisma\dev.db"
    if (-not (Test-Path $dbPath)) {
        Write-Host "New database, seeding..." -ForegroundColor Yellow
        npx ts-node prisma/seed.ts 2>$null
    }
}

Pop-Location
Write-Host ""
Write-Host "=== Done! Mode: $Mode ===" -ForegroundColor Cyan