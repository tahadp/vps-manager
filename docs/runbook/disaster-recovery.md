# Disaster Recovery Runbook

This runbook covers the scenarios where the platform becomes partially or fully unavailable
and how to restore service.

## Targets
- **RTO (Recovery Time Objective)**: 4 hours from incident declaration to full service restored
- **RPO (Recovery Point Objective)**: 1 hour of data loss maximum (satisfied by 4h cron of backup.sh)

## Backup policy
- **Local retention**: 7 days (`backup.sh` RETENTION_DAYS=7)
- **Off-site (S3)**: 30 days (planned, see [docs/m1-coolify-secrets.md](../m1-coolify-secrets.md) for current status)
- **Schedule**: `0 3 * * *` daily (see `server/scripts/backup.sh` header)

## Backup verification
```bash
# 1. List backup contents
ls -la /var/backups/vps-management/

# 2. Spot-check Postgres dump
gunzip -c /var/backups/vps-management/postgres-YYYY-MM-DD.sql.gz | head -100

# 3. Spot-check Redis BGSAVE
ls -la /var/backups/vps-management/redis-YYYY-MM-DD.rdb
```

## Restore procedure

### Full restore (DB lost, server boots clean)
1. SSH to Coolify host: `ssh root@45.198.68.109`
2. Stop backend: `coolify stop --resource application --uuid <server-uuid>`
3. Locate most recent backup: `ls -lt /var/backups/vps-management/ | head -5`
4. Restore Postgres:
   ```bash
   docker exec -i <postgres-container> psql -U postgres postgres < /var/backups/vps-management/postgres-LATEST.sql.gz
   ```
5. Restore Redis (only if persistence is required; for cache-only state, skip):
   ```bash
   docker cp /var/backups/vps-management/redis-LATEST.rdb <redis-container>:/data/dump.rdb
   docker restart <redis-container>
   ```
6. Start backend: `coolify start --resource application --uuid <server-uuid>`
7. Verify health: `curl https://<server-fqdn>/health/ready`
8. Restore drill: monthly; log timestamp + RTO in this runbook's "Drill log" section

### Single-VPS agent re-registration (DB intact, agent lost)
1. SSH to the affected VPS
2. Re-run agent install: `vps-agent --api-key=<key> --vps-id=<id> --backend-ip=45.198.68.109:50051`
3. Wait 10s for first heartbeat; check dashboard

## Failover (full Coolify host down)
1. Spin up new Coolify host with PostgreSQL + Redis + server + client
2. Mount backup volume from old host
3. Restore latest backup
4. Update DNS (manual) for `vps.tahatoprak.me`
5. Agents auto-reconnect on next retry (heartbeat exponential backoff)

## Drill log
| Date | Type | RTO achieved | Notes |
|------|------|--------------|-------|
| — | — | — | Run first drill in staging before declaring ready |

## Contact
- **On-call**: <placeholder>
- **Escalation**: <placeholder>
- **Infrastructure access**: Coolify host via SSH key on `~/.ssh/coolify-prod`
