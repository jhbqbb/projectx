-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ANALYST');

-- CreateEnum
CREATE TYPE "DatasetSource" AS ENUM ('ALPHA_VANTAGE', 'CSV_UPLOAD');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('ONE_MINUTE', 'FIVE_MINUTES', 'FIFTEEN_MINUTES', 'THIRTY_MINUTES', 'SIXTY_MINUTES');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BULLISH', 'BEARISH', 'FLAT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReportModule" AS ENUM ('CONTEXT_VS_REGULAR', 'GAP_ANALYSIS', 'DAY_OF_WEEK', 'SESSION_CONTINUATION', 'SESSION_REVERSAL', 'RANGE_EXPANSION', 'HIGH_LOW_BREAKS', 'OPENING_DRIVE', 'OPENING_RANGE');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('DRAFT', 'SAVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" "DatasetSource" NOT NULL,
    "status" "DatasetStatus" NOT NULL DEFAULT 'PENDING',
    "interval" "CandleInterval" NOT NULL DEFAULT 'FIVE_MINUTES',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "candleCount" INTEGER NOT NULL DEFAULT 0,
    "tradingDayCount" INTEGER NOT NULL DEFAULT 0,
    "coverageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "open" DECIMAL(18,6) NOT NULL,
    "high" DECIMAL(18,6) NOT NULL,
    "low" DECIMAL(18,6) NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "source" "DatasetSource" NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDay" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "tradingDate" DATE NOT NULL,
    "weekday" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "contextOpen" DECIMAL(18,6),
    "contextHigh" DECIMAL(18,6),
    "contextLow" DECIMAL(18,6),
    "contextClose" DECIMAL(18,6),
    "contextMovePct" DOUBLE PRECISION,
    "contextRangePct" DOUBLE PRECISION,
    "contextDirection" "Direction" NOT NULL DEFAULT 'UNKNOWN',
    "contextCandleCount" INTEGER NOT NULL DEFAULT 0,
    "regularOpen" DECIMAL(18,6),
    "regularHigh" DECIMAL(18,6),
    "regularLow" DECIMAL(18,6),
    "regularClose" DECIMAL(18,6),
    "regularMovePct" DOUBLE PRECISION,
    "regularRangePct" DOUBLE PRECISION,
    "regularDirection" "Direction" NOT NULL DEFAULT 'UNKNOWN',
    "regularCandleCount" INTEGER NOT NULL DEFAULT 0,
    "regularOpenVsContextHighPct" DOUBLE PRECISION,
    "regularOpenVsContextLowPct" DOUBLE PRECISION,
    "regularBrokeContextHigh" BOOLEAN NOT NULL DEFAULT false,
    "regularBrokeContextLow" BOOLEAN NOT NULL DEFAULT false,
    "regularReversedContext" BOOLEAN NOT NULL DEFAULT false,
    "openingRangeHigh" DECIMAL(18,6),
    "openingRangeLow" DECIMAL(18,6),
    "openingRangeBreak" "Direction" NOT NULL DEFAULT 'UNKNOWN',
    "dataQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT,
    "source" "DatasetSource" NOT NULL,
    "ticker" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "requestedFrom" TIMESTAMP(3),
    "requestedTo" TIMESTAMP(3),
    "status" "DatasetStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "barsInserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "datasetId" TEXT,
    "module" "ReportModule" NOT NULL,
    "title" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "chartSpec" JSONB NOT NULL DEFAULT '{}',
    "sourceDatasetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sql" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedStudy" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "datasetId" TEXT,
    "title" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'SAVED',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "datasetId" TEXT,
    "title" TEXT NOT NULL,
    "selectedReports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceDatasetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Dataset_ownerId_ticker_idx" ON "Dataset"("ownerId", "ticker");

-- CreateIndex
CREATE INDEX "Dataset_status_source_idx" ON "Dataset"("status", "source");

-- CreateIndex
CREATE INDEX "Candle_ticker_timestamp_idx" ON "Candle"("ticker", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Candle_datasetId_timestamp_interval_key" ON "Candle"("datasetId", "timestamp", "interval");

-- CreateIndex
CREATE INDEX "TradingDay_datasetId_year_month_idx" ON "TradingDay"("datasetId", "year", "month");

-- CreateIndex
CREATE INDEX "TradingDay_datasetId_weekday_idx" ON "TradingDay"("datasetId", "weekday");

-- CreateIndex
CREATE INDEX "TradingDay_contextDirection_regularDirection_idx" ON "TradingDay"("contextDirection", "regularDirection");

-- CreateIndex
CREATE UNIQUE INDEX "TradingDay_datasetId_tradingDate_key" ON "TradingDay"("datasetId", "tradingDate");

-- CreateIndex
CREATE INDEX "ReportRun_ownerId_module_idx" ON "ReportRun"("ownerId", "module");

-- CreateIndex
CREATE INDEX "ReportRun_datasetId_idx" ON "ReportRun"("datasetId");

-- CreateIndex
CREATE INDEX "SavedStudy_ownerId_status_idx" ON "SavedStudy"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ChatSession_ownerId_updatedAt_idx" ON "ChatSession"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatSessionId_createdAt_idx" ON "ChatMessage"("chatSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingDay" ADD CONSTRAINT "TradingDay_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedStudy" ADD CONSTRAINT "SavedStudy_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedStudy" ADD CONSTRAINT "SavedStudy_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

