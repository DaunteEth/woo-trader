-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeSimulationId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Simulation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StrategyConfig" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "followOwnSignals" BOOLEAN NOT NULL DEFAULT true,
    "followAISignals" BOOLEAN NOT NULL DEFAULT true,
    "aiExecutionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stopLossPercent" DOUBLE PRECISION,
    "takeProfitPercent" DOUBLE PRECISION,
    "emaPeriodFast" INTEGER,
    "emaPeriodSlow" INTEGER,
    "rsiPeriod" INTEGER,
    "rsiOverbought" INTEGER,
    "rsiOversold" INTEGER,
    "bbPeriod" INTEGER,
    "bbStdDev" DOUBLE PRECISION,
    "minSpread" DOUBLE PRECISION,
    "maxSpread" DOUBLE PRECISION,
    "vwapEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bbBreakoutStdDev" DOUBLE PRECISION,
    "momentumPeriod" INTEGER,
    "volumeMultiplier" DOUBLE PRECISION,
    "rsiMomentumThreshold" INTEGER,
    "trailingStopPercent" DOUBLE PRECISION,
    "minSpreadPercent" DOUBLE PRECISION,
    "maxSpreadPercent" DOUBLE PRECISION,
    "executionDelay" INTEGER,
    "feePercent" DOUBLE PRECISION,
    "minProfitPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Signal" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "indicators" TEXT NOT NULL,
    "suggestedEntry" DOUBLE PRECISION,
    "suggestedSL" DOUBLE PRECISION,
    "suggestedTP" DOUBLE PRECISION,
    "positionSize" DOUBLE PRECISION,
    "executed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Trade" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "signalId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pnl" DOUBLE PRECISION,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Position" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "leverage" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "margin" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "openTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closeTime" TIMESTAMP(3),
    "closedPnL" DOUBLE PRECISION,
    "unrealizedPnL" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceStats" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "totalPnL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sharpeRatio" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "avgWin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitFactor" DOUBLE PRECISION,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultToSimulation" BOOLEAN NOT NULL DEFAULT true,
    "activeSimulationId" TEXT,
    "envVariables" TEXT,
    "envContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_activeSimulationId_key" ON "public"."User"("activeSimulationId");

-- CreateIndex
CREATE INDEX "Simulation_userId_isActive_idx" ON "public"."Simulation"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Simulation_userId_name_key" ON "public"."Simulation"("userId", "name");

-- CreateIndex
CREATE INDEX "StrategyConfig_simulationId_idx" ON "public"."StrategyConfig"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyConfig_simulationId_name_key" ON "public"."StrategyConfig"("simulationId", "name");

-- CreateIndex
CREATE INDEX "Signal_simulationId_timestamp_idx" ON "public"."Signal"("simulationId", "timestamp");

-- CreateIndex
CREATE INDEX "Trade_simulationId_timestamp_idx" ON "public"."Trade"("simulationId", "timestamp");

-- CreateIndex
CREATE INDEX "Position_simulationId_symbol_idx" ON "public"."Position"("simulationId", "symbol");

-- CreateIndex
CREATE INDEX "Position_simulationId_closeTime_idx" ON "public"."Position"("simulationId", "closeTime");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceStats_simulationId_key" ON "public"."PerformanceStats"("simulationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "public"."UserSettings"("userId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_activeSimulationId_fkey" FOREIGN KEY ("activeSimulationId") REFERENCES "public"."Simulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Simulation" ADD CONSTRAINT "Simulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StrategyConfig" ADD CONSTRAINT "StrategyConfig_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "public"."Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Signal" ADD CONSTRAINT "Signal_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "public"."Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "public"."Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "public"."Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Position" ADD CONSTRAINT "Position_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "public"."Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceStats" ADD CONSTRAINT "PerformanceStats_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "public"."Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
