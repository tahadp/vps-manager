-- DropIndex
DROP INDEX "AuditLog_target_trgm_idx";

-- AlterTable
ALTER TABLE "AlertRule" ADD COLUMN     "customScript" TEXT;

-- AlterTable
ALTER TABLE "VpsSettings" ADD COLUMN     "customOfflineMessage" TEXT,
ADD COLUMN     "customOnlineMessage" TEXT,
ADD COLUMN     "offlineAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "offlineTimeoutSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "onlineAlertEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "HistoricalMetric_vpsId_timestamp_idx" ON "HistoricalMetric"("vpsId", "timestamp");
