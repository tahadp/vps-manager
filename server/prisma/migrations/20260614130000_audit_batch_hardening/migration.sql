-- Audit batch 2 hardening: missing columns, RefreshToken model, audit trigram index.
-- Brings DB schema in line with prisma/schema.prisma fields added in the
-- 2026-06-14 audit pass that never got their own migration.

-- F0-18: User dashboard preferences
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dashboardVpsOrder"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chartVisibleMetrics" TEXT;

-- F0-13: VpsSettings custom alert message + visibility
ALTER TABLE "VpsSettings" ADD COLUMN IF NOT EXISTS "telegramEnabled"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VpsSettings" ADD COLUMN IF NOT EXISTS "customAlertMessage" TEXT;
ALTER TABLE "VpsSettings" ADD COLUMN IF NOT EXISTS "visibleCharts"      TEXT     DEFAULT '["cpu","ram","disk","network"]';

-- F0-13: AlertRule per-rule custom script timeout
ALTER TABLE "AlertRule" ADD COLUMN IF NOT EXISTS "timeoutSeconds" INTEGER DEFAULT 30;

-- F2-1: Refresh token model + tokenVersion on User
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'RefreshToken_userId_fkey'
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Performance: pg_trgm GIN index on AuditLog.target (fuzzy search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "AuditLog_target_trgm_idx" ON "AuditLog" USING GIN ("target" gin_trgm_ops);
