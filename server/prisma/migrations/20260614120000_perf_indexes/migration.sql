-- Vps table
CREATE INDEX IF NOT EXISTS "Vps_userId_idx" ON "Vps"("userId");
CREATE INDEX IF NOT EXISTS "Vps_userId_status_idx" ON "Vps"("userId", "status");
CREATE INDEX IF NOT EXISTS "Vps_status_lastHeartbeat_idx" ON "Vps"("status", "lastHeartbeat");
CREATE INDEX IF NOT EXISTS "Vps_ipAddress_idx" ON "Vps"("ipAddress");

-- AlertRule table
CREATE INDEX IF NOT EXISTS "AlertRule_userId_idx" ON "AlertRule"("userId");
CREATE INDEX IF NOT EXISTS "AlertRule_userId_vpsId_idx" ON "AlertRule"("userId", "vpsId");

-- AuditLog table
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_target_idx" ON "AuditLog"("target");
