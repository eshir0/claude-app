-- CreateTable
CREATE TABLE "AiUsageEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricId" TEXT NOT NULL,
    "usagePercent" REAL NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recordedAt" DATETIME NOT NULL,
    "resetsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiUsageEntry_metricId_recordedAt_idx" ON "AiUsageEntry"("metricId", "recordedAt");
