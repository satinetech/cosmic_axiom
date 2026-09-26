#!/bin/bash

# Path: /COSMIC_AXIOM/infra/standup.sh

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${BLUE}║           COSMIC AXIOM - Infrastructure Setup              ║${RESET}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""

MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_USER="root"
MYSQL_PASSWORD="rootpassword"

echo -e "${BOLD}MySQL Configuration:${RESET}"
echo -e "  Host: ${YELLOW}$MYSQL_HOST${RESET}"
echo -e "  Port: ${YELLOW}$MYSQL_PORT${RESET}"
echo ""

# Tear down existing containers cleanly
echo -e "${BOLD}Cleaning up existing containers...${RESET}"
docker compose -f docker-compose.local.yml down --volumes --remove-orphans

echo -e "\n${BOLD}Starting MySQL container...${RESET}"

# Bring up MySQL container
docker compose -f docker-compose.local.yml up -d mysql

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
until mysqladmin ping -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" --password="$MYSQL_PASSWORD" --silent; do
    sleep 2
done

echo "MySQL is ready! Continuing..."

MICROSERVICES=("astral" "library" "forge" "singularity")  # Add more as needed

for DB in "${MICROSERVICES[@]}"; do
    echo "Creating database: $DB..."
    mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" --password="$MYSQL_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB;"
done

echo -e "${GREEN}✓ All databases created${RESET}\n"

# ALL_SERVICES includes services without databases too
ALL_SERVICES=("astral" "forge" "library" "singularity" "satellite" "horizon" "nebula")

# Define service ports for .env files
declare -A SERVICE_PORTS=(
    ["astral"]="3001"
    ["forge"]="3002"
    ["library"]="3003"
    ["singularity"]="3004"
    ["satellite"]="3005"
    ["horizon"]="3006"
    ["nebula"]="3007"
)

# Generate RSA keys for JWT authentication
echo -e "${BOLD}Generating RSA keys for services...${RESET}"
for SERVICE in "${ALL_SERVICES[@]}"; do
  SERVICE_DIR="../services/$SERVICE"
  KEY_DIR="$SERVICE_DIR/src/keys"
  
  # Create keys directory if it doesn't exist
  mkdir -p "$KEY_DIR"
  
  # Generate RSA keys if they don't exist
  if [ ! -f "$KEY_DIR/private.key" ] || [ ! -f "$KEY_DIR/public.key.pub" ]; then
    echo -e "  ${YELLOW}→${RESET} Generating keys for ${BOLD}$SERVICE${RESET}..."
    openssl genrsa -out "$KEY_DIR/private.key" 2048 2>/dev/null
    openssl rsa -in "$KEY_DIR/private.key" -pubout -out "$KEY_DIR/public.key.pub" 2>/dev/null
    echo -e "    ${GREEN}✓${RESET} Keys generated"
  else
    echo -e "  ${GREEN}✓${RESET} Keys already exist for ${BOLD}$SERVICE${RESET}"
  fi
done

echo -e "${GREEN}✓ All RSA keys generated${RESET}\n"

# Copy .env.example files to .env
echo -e "${BOLD}Setting up environment configuration...${RESET}"

# Copy .env.example files for each backend service
for SERVICE in "${ALL_SERVICES[@]}"; do
  ENV_EXAMPLE="../services/$SERVICE/.env.example"
  ENV_FILE="../services/$SERVICE/.env"
  
  if [ -f "$ENV_EXAMPLE" ]; then
    if [ ! -f "$ENV_FILE" ]; then
      echo -e "  ${YELLOW}→${RESET} Copying .env.example to .env for ${BOLD}$SERVICE${RESET}..."
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      
      # Generate unique JWT secret for each service
      JWT_SECRET=$(openssl rand -hex 32)
      sed -i "s/your_secure_jwt_secret_here_change_this/cosmic_axiom_jwt_secret_${SERVICE}_${JWT_SECRET}/g" "$ENV_FILE"
      
      echo -e "    ${GREEN}✓${RESET} .env created with unique JWT secret"
    else
      echo -e "  ${GREEN}✓${RESET} .env already exists for ${BOLD}$SERVICE${RESET}"
    fi
  else
    echo -e "  ${RED}✗${RESET} .env.example not found for ${BOLD}$SERVICE${RESET}"
  fi
done

# Copy frontend .env.example
FRONTEND_ENV_EXAMPLE="../frontend/.env.example"
FRONTEND_ENV="../frontend/.env"
if [ -f "$FRONTEND_ENV_EXAMPLE" ]; then
  if [ ! -f "$FRONTEND_ENV" ]; then
    echo -e "  ${YELLOW}→${RESET} Copying .env.example to .env for ${BOLD}frontend${RESET}..."
    cp "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV"
    echo -e "    ${GREEN}✓${RESET} .env created"
  else
    echo -e "  ${GREEN}✓${RESET} .env already exists for ${BOLD}frontend${RESET}"
  fi
else
  echo -e "  ${RED}✗${RESET} .env.example not found for ${BOLD}frontend${RESET}"
fi

echo -e "${GREEN}✓ Environment configuration complete${RESET}"
echo -e "${BOLD}${YELLOW}Note:${RESET} To enable AI features, configure your preferred AI provider in ${YELLOW}services/nebula/.env${RESET}"
echo -e "      and review other settings in the .env files as needed."
echo ""

# Run Prisma setup for each service with database
echo -e "${BOLD}Running Prisma setup for microservices...${RESET}"

for SERVICE in "${MICROSERVICES[@]}"; do
  echo -e "  ${YELLOW}→${RESET} Setting up Prisma for ${BOLD}$SERVICE${RESET}..."
  pushd "../services/$SERVICE" > /dev/null || continue

  # Install dependencies if needed
  if [ ! -d "node_modules" ]; then
    echo -e "    Installing dependencies..."
    npm install > /dev/null 2>&1
  fi

  # Generate client and apply migrations
  npx prisma generate > /dev/null 2>&1
  npx prisma migrate deploy > /dev/null 2>&1

  echo -e "    ${GREEN}✓${RESET} Prisma setup complete"
  popd > /dev/null
done

echo -e "${GREEN}✓ Prisma setup complete for all services${RESET}\n"

# Seed databases with test data
echo -e "${BOLD}Seeding databases with test data...${RESET}"

for DB in "${MICROSERVICES[@]}"; do
  SEED_FILE="seed_files/seed_${DB}.sql"
  if [ -f "$SEED_FILE" ]; then
    echo -e "  ${YELLOW}→${RESET} Seeding ${BOLD}$DB${RESET}..."
    mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" --password="$MYSQL_PASSWORD" "$DB" < "$SEED_FILE" 2>/dev/null
    echo -e "    ${GREEN}✓${RESET} Seeded successfully"
  fi
done

echo -e "${GREEN}✓ All databases seeded${RESET}\n"

# Create the first account.
#
# This replaces the administrator that seed_astral.sql used to INSERT with a
# fixed password. The password is generated here and printed once; it is
# different on every deployment and is not stored anywhere.
echo -e "${BOLD}Creating the first account...${RESET}"
pushd "../services/astral" > /dev/null
SEED_DEFAULT_ADMIN=true npm run --silent seed
popd > /dev/null
echo ""

# Final summary
echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║                    Setup Complete! 🎉                      ║${RESET}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo -e "  1. ${YELLOW}cd ..${RESET} (go to project root)"
echo -e "  2. ${YELLOW}./start.sh${RESET} (start all services)"
echo ""
echo -e "${BOLD}Signing in:${RESET}"
echo -e "  The administrator password was printed above, once. It is not stored anywhere."
echo ""
echo -e "${BOLD}${YELLOW}Note:${RESET} Remember to update the ${YELLOW}CLAUDE_API_KEY${RESET} in ${YELLOW}services/nebula/.env${RESET}"
echo -e "      if you want to use AI features."
echo ""
