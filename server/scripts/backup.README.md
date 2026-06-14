# Backup Script

Daily Postgres + Redis backup. Creates a `YYYYMMDD-HHMMSS/` folder under `BACKUP_DIR` containing:
- `postgres-*.sql.gz` — compressed pg_dump
- `redis-*.rdb` — Redis RDB snapshot
- `MANIFEST.txt` — timestamp, sizes, host

## Cron

```cron
0 3 * * * BACKUP_DIR=/var/backups/vps-management POSTGRES_PASSWORD=... POSTGRES_USER=... /opt/vps-management/server/scripts/backup.sh >> /var/log/vps-backup.log 2>&1
```

## Docker mode

If Postgres and Redis run in the docker-compose stack, the script auto-detects them via `docker ps -f name=vps_postgres` / `name=vps_redis` and uses `docker exec` to dump from inside the container. Container names can be overridden with `POSTGRES_CONTAINER` / `REDIS_CONTAINER` env vars.

## Local mode

If running outside docker-compose, set `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT` env vars. Requires local `pg_dump` and `redis-cli` binaries.

## Restore

```bash
# Postgres
gunzip -c postgres-*.sql.gz | psql -U vps_admin -d vps_management

# Redis
cp redis-*.rdb /var/lib/redis/dump.rdb && redis-cli SHUTDOWN NOSAVE && redis-server /etc/redis/redis.conf
```

## Retention

Default 7 days. Override with `RETENTION_DAYS=30`.
