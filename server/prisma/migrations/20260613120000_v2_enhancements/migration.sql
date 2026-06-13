-- AlterEnum
ALTER TYPE "OsType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "AlertRule" ADD COLUMN     "customMessage" TEXT,
ADD COLUMN     "offlineThresholdMin" INTEGER,
ADD COLUMN     "restartOnAlert" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "metric" DROP NOT NULL,
ALTER COLUMN "condition" DROP NOT NULL,
ALTER COLUMN "threshold" DROP NOT NULL,
ALTER COLUMN "durationMin" DROP NOT NULL;

-- AlterTable
ALTER TABLE "HistoricalMetric" ADD COLUMN     "diskTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "netRx" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "netTx" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chartVisibleMetrics" TEXT,
ADD COLUMN     "dashboardVpsOrder" TEXT,
ADD COLUMN     "lastLogin" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vps" ADD COLUMN     "customOsName" TEXT;
