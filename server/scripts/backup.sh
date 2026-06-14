#!/usr/bin/env bash
# VPS Management - Backup Script
# Cron: 0 3 * * * /opt/vps-management/server/scripts/backup.sh
# Manual: BACKUP_DIR=/path/to/backups bash backup.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/vps-management}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DAY_DIR="${BACKUP_DIR}/${TIMESTAMP}"
mkdir -p "${DAY_DIR}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-vps_postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-vps_redis}"

# --- Postgres dump ---
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER required}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}"
POSTGRES_DB="${POSTGRES_DB:-vps_management}"
PG_DUMP_FILE="${DAY_DIR}/postgres-${TIMESTAMP}.sql.gz"

if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q -f name=${POSTGRES_CONTAINER} 2>/dev/null)" ]; then
  # Postgres is running in a Docker container
  echo "[backup] pg_dump via docker exec (${POSTGRES_CONTAINER})"
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
    pg_dump -U "${POSTGRES_USER}" -h localhost -p 5432 "${POSTGRES_DB}" \
    | gzip > "${PG_DUMP_FILE}"
else
  echo "[backup] pg_dump via local pg_dump"
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${PG_DUMP_FILE}"
fi
echo "[backup] Postgres dump: ${PG_DUMP_FILE} ($(du -h "${PG_DUMP_FILE}" | cut -f1))"

# --- Redis RDB snapshot ---
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_FILE="${DAY_DIR}/redis-${TIMESTAMP}.rdb"

if command -v docker >/dev/null 2>&1 && [ -n "$(docker ps -q -f name=${REDIS_CONTAINER} 2>/dev/null)" ]; then
  echo "[backup] redis BGSAVE via docker exec (${REDIS_CONTAINER})"
  if [ -n "${REDIS_PASSWORD}" ]; then
    docker exec "${REDIS_CONTAINER}" sh -c "redis-cli -a '${REDIS_PASSWORD}' --no-auth-warning BGSAVE"
  else
    docker exec "${REDIS_CONTAINER}" sh -c "redis-cli BGSAVE"
  fi
  sleep 2
  docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${REDIS_FILE}" 2>/dev/null \
    || echo "[backup] WARNING: docker cp failed; check redis container data dir"
else
  echo "[backup] redis BGSAVE via local redis-cli"
  if [ -n "${REDIS_PASSWORD}" ]; then
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}" --no-auth-warning BGSAVE
  else
    redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" BGSAVE
  fi
  sleep 2
  if [ -f /var/lib/redis/dump.rdb ]; then cp /var/lib/redis/dump.rdb "${REDIS_FILE}"
  elif [ -f /data/dump.rdb ]; then cp /data/dump.rdb "${REDIS_FILE}"
  else echo "[backup] WARNING: could not find dump.rdb; check redis config dir"; fi
fi
[ -f "${REDIS_FILE}" ] && echo "[backup] Redis snapshot: ${REDIS_FILE} ($(du -h "${REDIS_FILE}" | cut -f1))"

# --- Retention: prune backups older than RETENTION_DAYS ---
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +
echo "[backup] Pruned backups older than ${RETENTION_DAYS} days"

# --- Manifest ---
REDIS_SIZE="$(du -h "${REDIS_FILE}" 2>/dev/null | cut -f1 || echo "missing")"
cat > "${DAY_DIR}/MANIFEST.txt" <<EOF
backup_timestamp: ${TIMESTAMP}
postgres_file: $(basename "${PG_DUMP_FILE}")
postgres_size: $(du -h "${PG_DUMP_FILE}" | cut -f1)
redis_file: $(basename "${REDIS_FILE}")
redis_size: ${REDIS_SIZE}
host: $(hostname)
EOF

echo "[backup] Done. Manifest: ${DAY_DIR}/MANIFEST.txt"
