# Cosmic Axiom Infrastructure Setup for Windows
# Run with: .\standup.ps1

# MySQL Configuration
$MYSQL_HOST = "127.0.0.1"
$MYSQL_PORT = "3306"
$MYSQL_USER = "root"
$MYSQL_PASSWORD = "rootpassword"

# Service definitions
$MICROSERVICES = @("astral", "library", "forge", "singularity")
$ALL_SERVICES = @("astral", "forge", "library", "singularity", "satellite", "horizon", "nebula")

# Service ports
$SERVICE_PORTS = @{
    "astral" = 3001
    "forge" = 3002
    "library" = 3003
    "singularity" = 3004
    "satellite" = 3005
    "horizon" = 3006
    "nebula" = 3007
}

# Clear screen
Clear-Host

# Print header
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║           COSMIC AXIOM - Infrastructure Setup              ║" -ForegroundColor Blue
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

Write-Host "MySQL Configuration:" -ForegroundColor White
Write-Host "  Host: $MYSQL_HOST" -ForegroundColor Yellow
Write-Host "  Port: $MYSQL_PORT" -ForegroundColor Yellow
Write-Host ""

# Check if Docker is running
try {
    $dockerVersion = docker version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is not running"
    }
} catch {
    Write-Host "ERROR: Docker is not running or not installed!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Tear down existing containers
Write-Host "Cleaning up existing containers..." -ForegroundColor White
docker compose -f docker-compose.local.yml down --volumes --remove-orphans 2>&1 | Out-Null

Write-Host ""
Write-Host "Starting MySQL container..." -ForegroundColor White

# Start MySQL container
docker compose -f docker-compose.local.yml up -d mysql 2>&1 | Out-Null

# Wait for MySQL to be ready
Write-Host "Waiting for MySQL to be ready..." -ForegroundColor Yellow
$attempts = 0
$maxAttempts = 30

while ($attempts -lt $maxAttempts) {
    $result = docker exec mysql-cosmic-axiom mysqladmin ping -h"localhost" -u"$MYSQL_USER" --password="$MYSQL_PASSWORD" --silent 2>&1
    if ($LASTEXITCODE -eq 0) {
        break
    }
    Start-Sleep -Seconds 2
    $attempts++
    Write-Host "." -NoNewline
}

if ($attempts -eq $maxAttempts) {
    Write-Host ""
    Write-Host "ERROR: MySQL failed to start!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "MySQL is ready!" -ForegroundColor Green
Write-Host ""

# Create databases
Write-Host "Creating databases..." -ForegroundColor White
foreach ($db in $MICROSERVICES) {
    Write-Host "  Creating database: $db..." -ForegroundColor Gray
    $query = "CREATE DATABASE IF NOT EXISTS $db;"
    docker exec mysql-cosmic-axiom mysql -h"localhost" -u"$MYSQL_USER" --password="$MYSQL_PASSWORD" -e "$query" 2>&1 | Out-Null
}
Write-Host "✓ All databases created" -ForegroundColor Green
Write-Host ""

# Generate RSA keys
Write-Host "Generating RSA keys for services..." -ForegroundColor White
foreach ($service in $ALL_SERVICES) {
    $serviceDir = Join-Path ".." "services\$service"
    $keyDir = Join-Path $serviceDir "src\keys"
    
    # Create keys directory if it doesn't exist
    if (-not (Test-Path $keyDir)) {
        New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
    }
    
    $privateKey = Join-Path $keyDir "private.key"
    $publicKey = Join-Path $keyDir "public.key.pub"
    
    # Generate keys if they don't exist
    if (-not (Test-Path $privateKey) -or -not (Test-Path $publicKey)) {
        Write-Host "  → Generating keys for $service..." -ForegroundColor Yellow
        
        # Generate private key
        & openssl genrsa -out $privateKey 2048 2>&1 | Out-Null
        
        # Generate public key
        & openssl rsa -in $privateKey -pubout -out $publicKey 2>&1 | Out-Null
        
        Write-Host "    ✓ Keys generated" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Keys already exist for $service" -ForegroundColor Green
    }
}
Write-Host "✓ All RSA keys generated" -ForegroundColor Green
Write-Host ""

# Copy .env.example files to .env
Write-Host "Setting up environment configuration..." -ForegroundColor White

foreach ($service in $ALL_SERVICES) {
    $envExample = Join-Path ".." "services\$service\.env.example"
    $envFile = Join-Path ".." "services\$service\.env"
    
    if (Test-Path $envExample) {
        if (-not (Test-Path $envFile)) {
            Write-Host "  → Copying .env.example to .env for $service..." -ForegroundColor Yellow
            Copy-Item $envExample $envFile
            
            # Generate unique JWT secret for each service
            $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
            $content = Get-Content $envFile -Raw
            $content = $content -replace "your_secure_jwt_secret_here_change_this", "cosmic_axiom_jwt_secret_${service}_$jwtSecret"
            Set-Content -Path $envFile -Value $content -Encoding UTF8
            
            Write-Host "    ✓ .env created with unique JWT secret" -ForegroundColor Green
        } else {
            Write-Host "  ✓ .env already exists for $service" -ForegroundColor Green
        }
    } else {
        Write-Host "  ✗ .env.example not found for $service" -ForegroundColor Red
    }
}

# Copy frontend .env.example
$frontendEnvExample = Join-Path ".." "frontend\.env.example"
$frontendEnv = Join-Path ".." "frontend\.env"
if (Test-Path $frontendEnvExample) {
    if (-not (Test-Path $frontendEnv)) {
        Write-Host "  → Copying .env.example to .env for frontend..." -ForegroundColor Yellow
        Copy-Item $frontendEnvExample $frontendEnv
        Write-Host "    ✓ .env created" -ForegroundColor Green
    } else {
        Write-Host "  ✓ .env already exists for frontend" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ .env.example not found for frontend" -ForegroundColor Red
}

Write-Host "✓ Environment configuration complete" -ForegroundColor Green
Write-Host "Note: To enable AI features, configure your preferred AI provider in services\nebula\.env" -ForegroundColor Yellow
Write-Host "      and review other settings in the .env files as needed." -ForegroundColor Gray
Write-Host ""

# Run Prisma setup
Write-Host "Running Prisma setup for microservices..." -ForegroundColor White

foreach ($service in $MICROSERVICES) {
    Write-Host "  → Setting up Prisma for $service..." -ForegroundColor Yellow
    
    $servicePath = Join-Path ".." "services\$service"
    Push-Location $servicePath
    
    try {
        # Check if node_modules exists
        if (-not (Test-Path "node_modules")) {
            Write-Host "    Installing dependencies..." -ForegroundColor Gray
            npm install --silent 2>&1 | Out-Null
        }
        
        # Generate Prisma client
        npx prisma generate 2>&1 | Out-Null
        
        # Try to deploy migrations first, fallback to db push if needed
        $migrateResult = npx prisma migrate deploy 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    Migration deploy failed, trying db push..." -ForegroundColor Gray
            npx prisma db push 2>&1 | Out-Null
        }
        
        Write-Host "    ✓ Prisma setup complete" -ForegroundColor Green
    } catch {
        Write-Host "    ✗ Prisma setup failed: $_" -ForegroundColor Red
    } finally {
        Pop-Location
    }
}

Write-Host "✓ Prisma setup complete for all services" -ForegroundColor Green
Write-Host ""

# Seed databases
Write-Host "Seeding databases with test data..." -ForegroundColor White

foreach ($db in $MICROSERVICES) {
    $seedFile = "seed_files\seed_$db.sql"
    if (Test-Path $seedFile) {
        Write-Host "  → Seeding $db..." -ForegroundColor Yellow
        
        # Read the SQL file and execute it
        Get-Content $seedFile -Raw | docker exec -i mysql-cosmic-axiom mysql -h"localhost" -u"$MYSQL_USER" --password="$MYSQL_PASSWORD" "$db" 2>&1 | Out-Null
        
        Write-Host "    ✓ Seeded successfully" -ForegroundColor Green
    }
}

Write-Host "✓ All databases seeded" -ForegroundColor Green
Write-Host ""

# Create the first account. Replaces the administrator that seed_astral.sql used
# to INSERT with a fixed password; this one is generated and printed once.
Write-Host "Creating the first account..." -ForegroundColor White
Push-Location "..\services\astral"
$env:SEED_DEFAULT_ADMIN = "true"
npm run --silent seed
Remove-Item Env:\SEED_DEFAULT_ADMIN
Pop-Location
Write-Host ""

# Final summary
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Setup Complete! 🎉                      ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. cd .. (go to project root)" -ForegroundColor Yellow
Write-Host "  2. .\start.ps1 (start all services)" -ForegroundColor Yellow
Write-Host ""
Write-Host "The administrator password was printed above, once." -ForegroundColor White
Write-Host "It is not stored anywhere -- copy it before closing this window." -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Remember to update the CLAUDE_API_KEY in services\nebula\.env" -ForegroundColor Yellow
Write-Host "      if you want to use AI features." -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")