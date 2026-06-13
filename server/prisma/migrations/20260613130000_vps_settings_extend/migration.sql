-- AlterTable
ALTER TABLE "VpsSettings" ADD COLUMN     "customAlertMessage" TEXT,
ADD COLUMN     "telegramEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "visibleCharts" TEXT DEFAULT '["cpu","ram","disk","network"]';
