-- CreateTable
CREATE TABLE "AccessLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "userAgent" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IpGeoCache" (
    "ip" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AccessLogEntry_ip_at_idx" ON "AccessLogEntry"("ip", "at");

-- CreateIndex
CREATE INDEX "AccessLogEntry_source_at_idx" ON "AccessLogEntry"("source", "at");

-- CreateIndex
CREATE INDEX "AccessLogEntry_at_idx" ON "AccessLogEntry"("at");
