-- Recreate GIN trigram index on AuditLog.target that was dropped in
-- migration 20260615232456_add_heartbeat_uptime_alerts_settings. The index
-- is required for fast ILIKE/LIKE search on the audit log target field
-- (F1-2 performance fix). CONCURRENTLY would be ideal in production, but
-- Prisma runs migrations in a transaction; use a plain CREATE INDEX
-- and accept the table-level lock. The target column already has a
-- btree index from schema.prisma:89, so the GIN index adds trigram
-- support without conflict.
CREATE INDEX IF NOT EXISTS "AuditLog_target_trgm_idx" ON "AuditLog" USING GIN ("target" gin_trgm_ops);
