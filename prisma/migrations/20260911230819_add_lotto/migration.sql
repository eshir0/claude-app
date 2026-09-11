-- CreateTable
CREATE TABLE "LottoDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "round" INTEGER NOT NULL,
    "n1" INTEGER NOT NULL,
    "n2" INTEGER NOT NULL,
    "n3" INTEGER NOT NULL,
    "n4" INTEGER NOT NULL,
    "n5" INTEGER NOT NULL,
    "n6" INTEGER NOT NULL,
    "bonus" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LottoComboSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forRound" INTEGER NOT NULL,
    "combosJson" TEXT NOT NULL,
    "randomPickIndex" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LottoDraw_round_key" ON "LottoDraw"("round");

-- CreateIndex
CREATE UNIQUE INDEX "LottoComboSet_forRound_key" ON "LottoComboSet"("forRound");
