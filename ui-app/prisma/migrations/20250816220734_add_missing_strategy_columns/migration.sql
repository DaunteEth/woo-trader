-- AlterTable
ALTER TABLE "public"."StrategyConfig" ADD COLUMN     "confidenceThreshold" DOUBLE PRECISION,
ADD COLUMN     "depthLevels" INTEGER,
ADD COLUMN     "fundingThreshold" DOUBLE PRECISION,
ADD COLUMN     "hoursBeforeFunding" INTEGER,
ADD COLUMN     "maxPositionHoldTime" INTEGER,
ADD COLUMN     "maxSpreadBps" DOUBLE PRECISION,
ADD COLUMN     "minFundingRate" DOUBLE PRECISION,
ADD COLUMN     "minImbalance" DOUBLE PRECISION,
ADD COLUMN     "minSpreadBps" DOUBLE PRECISION,
ADD COLUMN     "minVolumeRatio" DOUBLE PRECISION,
ADD COLUMN     "perpFeePercent" DOUBLE PRECISION,
ADD COLUMN     "spotFeePercent" DOUBLE PRECISION;
