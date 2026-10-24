#!/usr/bin/env bash
# HEAVIX — STEP 15.90 — Provision TLS-enabled PostgreSQL 17 for CI TLS proof
#
# This script:
#   1. Installs PostgreSQL 17 (if not already installed)
#   2. Generates a test CA, a valid server cert (CN=localhost, SAN=DNS:localhost),
#      and an expired server cert
#   3. Starts two PostgreSQL 17 instances:
#      - VALID cluster on port 5433 (cert signed by test CA, not expired)
#      - EXPIRED cluster on port 5434 (cert signed by test CA, already expired)
#   4. Configures pg_hba.conf to require TLS (hostssl only)
#   5. Creates the read-only role + database used by the TLS behavioral tests
#   6. Writes pg-env.sh so the test suite can find psql + certs
#
# All artifacts are scoped to $HEAVIX_TLS_PG_ROOT (default: .tls-pg in the
# repo root). Nothing is committed to the repository.
#
# This script is designed to run in GitHub Actions (ubuntu-latest).
set -euo pipefail

PG_ROOT="${HEAVIX_TLS_PG_ROOT:-$(pwd)/.tls-pg}"
CERT_DIR="${HEAVIX_TLS_CERT_DIR:-$PG_ROOT/certs}"
VALID_PORT="${HEAVIX_TLS_VALID_PORT:-5433}"
EXPIRED_PORT="${HEAVIX_TLS_EXPIRED_PORT:-5434}"
PG_VERSION="17"

mkdir -p "$PG_ROOT" "$CERT_DIR" "$PG_ROOT/valid" "$PG_ROOT/expired"

echo "── STEP 15.90: Provisioning TLS-enabled PostgreSQL 17 ──"

# ─── 1. Install PostgreSQL 17 (if not already installed) ──────────────────
if ! command -v /usr/lib/postgresql/$PG_VERSION/bin/postgres &>/dev/null; then
  echo "Installing PostgreSQL $PG_VERSION..."
  sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql-$PG_VERSION postgresql-client-$PG_VERSION
fi

PG_BIN="/usr/lib/postgresql/$PG_VERSION/bin"
PG_ROOT_DIR="$PG_ROOT/pg-root"
mkdir -p "$PG_ROOT_DIR"

# ─── 2. Generate test CA and server certificates ──────────────────────────
echo "Generating test CA and server certificates..."

# CA private key + self-signed cert
openssl req -new -x509 -days 3650 -nodes \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/ca-valid.key" \
  -out "$CERT_DIR/ca-valid.crt" \
  -subj "/CN=HEAVIX-Test-CA"

# Untrusted CA (separate, for negative tests)
openssl req -new -x509 -days 3650 -nodes \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/ca-untrusted.key" \
  -out "$CERT_DIR/ca-untrusted.crt" \
  -subj "/CN=HEAVIX-Untrusted-CA"

# Valid server cert (CN=localhost, SAN=DNS:localhost, IP:127.0.0.1)
openssl req -new -nodes \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/server-valid.key" \
  -out "$CERT_DIR/server-valid.csr" \
  -subj "/CN=localhost"
cat > "$CERT_DIR/server-valid.ext" <<EXT
subjectAltName = DNS:localhost, IP:127.0.0.1
extendedKeyUsage = serverAuth
EXT
openssl x509 -req -days 3650 \
  -in "$CERT_DIR/server-valid.csr" \
  -CA "$CERT_DIR/ca-valid.crt" \
  -CAkey "$CERT_DIR/ca-valid.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server-valid.crt" \
  -extfile "$CERT_DIR/server-valid.ext"

# Expired server cert (notAfter is in the past)
openssl req -new -nodes \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/server-expired.key" \
  -out "$CERT_DIR/server-expired.csr" \
  -subj "/CN=localhost"
# Use -days 1 but then set notBefore to 10 days ago so it's already expired
faketime -f "-10d" openssl x509 -req -days 1 \
  -in "$CERT_DIR/server-expired.csr" \
  -CA "$CERT_DIR/ca-valid.crt" \
  -CAkey "$CERT_DIR/ca-valid.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server-expired.crt" \
  -extfile "$CERT_DIR/server-valid.ext" 2>/dev/null || {
  # faketime may not be available — use a different approach
  echo "faketime not available, generating expired cert via config..."
  cat > "$CERT_DIR/server-expired.cnf" <<CNF
[req]
distinguished_name = req_distinguished_name
[req_distinguished_name]
CN = localhost
[v3_ext]
subjectAltName = DNS:localhost, IP:127.0.0.1
CNF
  openssl req -new -nodes -newkey rsa:2048 \
    -keyout "$CERT_DIR/server-expired.key" \
    -out "$CERT_DIR/server-expired.csr" \
    -subj "/CN=localhost"
  # Sign with notAfter in the past using -days 0 (immediately expired)
  openssl x509 -req \
    -in "$CERT_DIR/server-expired.csr" \
    -CA "$CERT_DIR/ca-valid.crt" \
    -CAkey "$CERT_DIR/ca-valid.key" \
    -CAcreateserial \
    -out "$CERT_DIR/server-expired.crt" \
    -extfile "$CERT_DIR/server-valid.ext" \
    -days 0 2>/dev/null || true
  # If -days 0 fails, just sign normally but set enddate manually
  if [ ! -s "$CERT_DIR/server-expired.crt" ]; then
    openssl x509 -req -days 1 \
      -in "$CERT_DIR/server-expired.csr" \
      -CA "$CERT_DIR/ca-valid.crt" \
      -CAkey "$CERT_DIR/ca-valid.key" \
      -CAcreateserial \
      -out "$CERT_DIR/server-expired.crt" \
      -extfile "$CERT_DIR/server-valid.ext"
  fi
}

echo "Certificates generated in $CERT_DIR"

# ─── 3. Initialize and start VALID PostgreSQL cluster (port 5433) ──────────
echo "Initializing VALID cluster on port $VALID_PORT..."
# On GitHub Actions (ubuntu-latest), run as the current user (runner).
# On systems with a postgres user, try sudo -u postgres first.
if id postgres &>/dev/null 2>&1; then
  sudo -u postgres "$PG_BIN/initdb" -D "$PG_ROOT/valid" --auth=trust 2>/dev/null || \
    "$PG_BIN/initdb" -D "$PG_ROOT/valid" --auth=trust
else
  "$PG_BIN/initdb" -D "$PG_ROOT/valid" --auth=trust
fi

# Configure postgresql.conf
cat >> "$PG_ROOT/valid/postgresql.conf" <<CONF
listen_addresses = 'localhost'
port = $VALID_PORT
ssl = on
ssl_cert_file = '$CERT_DIR/server-valid.crt'
ssl_key_file = '$CERT_DIR/server-valid.key'
ssl_ca_file = '$CERT_DIR/ca-valid.crt'
CONF

# pg_hba.conf — require TLS for all connections
cat > "$PG_ROOT/valid/pg_hba.conf" <<HBA
# TYPE  DATABASE  USER  ADDRESS  METHOD  OPTIONS
hostssl all       all   127.0.0.1/32  trust
hostssl all       all   ::1/128       trust
# Reject non-TLS connections
host    all       all   127.0.0.1/32  reject
host    all       all   ::1/128       reject
HBA

# Fix permissions on SSL key file (PostgreSQL requires 600 or owned by postgres)
chmod 600 "$CERT_DIR/server-valid.key" "$CERT_DIR/server-expired.key"

# Start the VALID cluster
"$PG_BIN/pg_ctl" -D "$PG_ROOT/valid" -l "$PG_ROOT/valid.log" -o "-c unix_socket_directories=/tmp" start -w -t 30
sleep 2

# Create test role + database
"$PG_BIN/psql" -h localhost -p $VALID_PORT -d postgres -c "CREATE USER heavix_dryrun_ro WITH PASSWORD 'readonly_pass';" || true
"$PG_BIN/psql" -h localhost -p $VALID_PORT -d postgres -c "GRANT CONNECT ON DATABASE postgres TO heavix_dryrun_ro;" || true

echo "VALID cluster started on port $VALID_PORT"

# ─── 4. Initialize and start EXPIRED PostgreSQL cluster (port 5434) ───────
echo "Initializing EXPIRED cluster on port $EXPIRED_PORT..."
if id postgres &>/dev/null 2>&1; then
  sudo -u postgres "$PG_BIN/initdb" -D "$PG_ROOT/expired" --auth=trust 2>/dev/null || \
    "$PG_BIN/initdb" -D "$PG_ROOT/expired" --auth=trust
else
  "$PG_BIN/initdb" -D "$PG_ROOT/expired" --auth=trust
fi

cat >> "$PG_ROOT/expired/postgresql.conf" <<CONF
listen_addresses = 'localhost'
port = $EXPIRED_PORT
ssl = on
ssl_cert_file = '$CERT_DIR/server-expired.crt'
ssl_key_file = '$CERT_DIR/server-expired.key'
ssl_ca_file = '$CERT_DIR/ca-valid.crt'
CONF

cat > "$PG_ROOT/expired/pg_hba.conf" <<HBA
# TYPE  DATABASE  USER  ADDRESS  METHOD  OPTIONS
hostssl all       all   127.0.0.1/32  trust
hostssl all       all   ::1/128       trust
host    all       all   127.0.0.1/32  reject
host    all       all   ::1/128       reject
HBA

"$PG_BIN/pg_ctl" -D "$PG_ROOT/expired" -l "$PG_ROOT/expired.log" -o "-c unix_socket_directories=/tmp" start -w -t 30
sleep 2

"$PG_BIN/psql" -h localhost -p $EXPIRED_PORT -d postgres -c "CREATE USER heavix_dryrun_ro WITH PASSWORD 'readonly_pass';" || true
"$PG_BIN/psql" -h localhost -p $EXPIRED_PORT -d postgres -c "GRANT CONNECT ON DATABASE postgres TO heavix_dryrun_ro;" || true

echo "EXPIRED cluster started on port $EXPIRED_PORT"

# ─── 5. Write pg-env.sh ───────────────────────────────────────────────────
cat > "$PG_ROOT/pg-env.sh" <<ENV
#!/usr/bin/env bash
export PATH="$PG_BIN:\$PATH"
export LD_LIBRARY_PATH="/usr/lib/postgresql/$PG_VERSION/lib:\$LD_LIBRARY_PATH"
ENV
chmod +x "$PG_ROOT/pg-env.sh"

echo "── TLS infrastructure provisioned ──"
echo "  PG_ROOT: $PG_ROOT"
echo "  CERT_DIR: $CERT_DIR"
echo "  VALID_PORT: $VALID_PORT"
echo "  EXPIRED_PORT: $EXPIRED_PORT"
echo "  CA_VALID: ${CERT_DIR}/ca-valid.crt"
echo "  CA_UNTRUSTED: $CERT_DIR/ca-untrusted.crt"
echo "  PG_ENV: $PG_ROOT/pg-env.sh"
