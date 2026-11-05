-- CreateEnum
CREATE TYPE "PriceStatus" AS ENUM ('VERIFIED', 'STALE', 'DEMO');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('VERIFIED', 'FAILED', 'UNAVAILABLE', 'DEMO', 'STALE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('BARCODE', 'FRESH_RULE', 'BRAND_SIZE_FUZZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'REVIEW', 'REJECTED');

-- CreateTable
CREATE TABLE "SupermarketChains" (
    "id" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "chainCodes" TEXT[],
    "color" TEXT NOT NULL DEFAULT '#14532d',
    "website" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupermarketChains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branches" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "subchainCode" TEXT,
    "subchainName" TEXT,
    "nameHe" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategories" (
    "id" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#166534',
    "icon" TEXT NOT NULL DEFAULT '🛒',

    CONSTRAINT "ProductCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Products" (
    "id" TEXT NOT NULL,
    "barcode" TEXT,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "brand" TEXT,
    "categoryId" TEXT NOT NULL,
    "sizeAmount" DECIMAL(12,3),
    "sizeUnit" TEXT,
    "soldByWeight" BOOLEAN NOT NULL DEFAULT false,
    "matchKind" TEXT NOT NULL DEFAULT 'BARCODE',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImages" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "source" TEXT NOT NULL,
    "license" TEXT,
    "attribution" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainItems" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemType" TEXT,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "sizeAmount" DECIMAL(12,3),
    "sizeUnit" TEXT,
    "isWeighted" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "candidateProductId" TEXT,
    "matchMethod" "MatchMethod",
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'REVIEW',
    "matchScore" DOUBLE PRECISION,
    "matchReason" TEXT,
    "samplePrice" DECIMAL(10,2),
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChainItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrices" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "chainId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "regularPrice" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2),
    "unitLabel" TEXT,
    "dataSourceId" INTEGER NOT NULL,
    "sourceFileId" INTEGER NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(3) NOT NULL,
    "priceChangedAt" TIMESTAMPTZ(3),
    "lastSaleAt" TIMESTAMPTZ(3),
    "verificationStatus" "PriceStatus" NOT NULL DEFAULT 'VERIFIED',
    "suspect" BOOLEAN NOT NULL DEFAULT false,
    "suspectReason" TEXT,
    "raw" JSONB,

    CONSTRAINT "ProductPrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" BIGSERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "chainId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourcePublishedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceFileId" INTEGER NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotions" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "promotionCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "sourceUpdated" TIMESTAMPTZ(3),
    "clubId" TEXT,
    "requiresClub" BOOLEAN NOT NULL DEFAULT false,
    "isCoupon" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "sourceFileId" INTEGER NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "Promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionItems" (
    "id" SERIAL NOT NULL,
    "promotionId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "rewardType" TEXT,
    "minQty" DECIMAL(10,3),
    "maxQty" DECIMAL(10,3),
    "discountedPrice" DECIMAL(10,2),
    "discountRate" DECIMAL(6,2),
    "promoUnitPrice" DECIMAL(10,2),
    "computable" BOOLEAN NOT NULL DEFAULT false,
    "notComputableBecause" TEXT,

    CONSTRAINT "PromotionItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSources" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "updateFrequencyHours" INTEGER NOT NULL DEFAULT 24,
    "termsNote" TEXT,

    CONSTRAINT "DataSources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFiles" (
    "id" SERIAL NOT NULL,
    "dataSourceId" INTEGER NOT NULL,
    "importJobId" INTEGER,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storeCode" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "downloadedAt" TIMESTAMPTZ(3) NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT,
    "itemCount" INTEGER,

    CONSTRAINT "SourceFiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJobs" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "dataSourceId" INTEGER,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "branchesProcessed" INTEGER NOT NULL DEFAULT 0,
    "filesFound" INTEGER NOT NULL DEFAULT 0,
    "filesDownloaded" INTEGER NOT NULL DEFAULT 0,
    "itemsParsed" INTEGER NOT NULL DEFAULT 0,
    "productsMatched" INTEGER NOT NULL DEFAULT 0,
    "pricesValid" INTEGER NOT NULL DEFAULT 0,
    "pricesChanged" INTEGER NOT NULL DEFAULT 0,
    "promotionsLoaded" INTEGER NOT NULL DEFAULT 0,
    "reviewItems" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "ImportJobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorChecks" (
    "id" SERIAL NOT NULL,
    "chainId" TEXT NOT NULL,
    "dataSourceId" INTEGER,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ConnectorStatus" NOT NULL,
    "durationMs" INTEGER,
    "latestFile" TEXT,
    "latestFileAt" TIMESTAMPTZ(3),
    "itemsParsed" INTEGER,
    "validPrices" INTEGER,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL,

    CONSTRAINT "ConnectorChecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingCarts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShoppingCarts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItems" (
    "id" SERIAL NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,

    CONSTRAINT "CartItems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Branches_city_idx" ON "Branches"("city");

-- CreateIndex
CREATE INDEX "Branches_chainId_idx" ON "Branches"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Branches_chainId_storeCode_key" ON "Branches"("chainId", "storeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Products_barcode_key" ON "Products"("barcode");

-- CreateIndex
CREATE INDEX "Products_categoryId_idx" ON "Products"("categoryId");

-- CreateIndex
CREATE INDEX "Products_brand_idx" ON "Products"("brand");

-- CreateIndex
CREATE INDEX "Products_nameHe_idx" ON "Products"("nameHe");

-- CreateIndex
CREATE INDEX "ProductImages_productId_idx" ON "ProductImages"("productId");

-- CreateIndex
CREATE INDEX "ChainItems_productId_idx" ON "ChainItems"("productId");

-- CreateIndex
CREATE INDEX "ChainItems_matchStatus_idx" ON "ChainItems"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ChainItems_chainId_itemCode_key" ON "ChainItems"("chainId", "itemCode");

-- CreateIndex
CREATE INDEX "ProductPrices_chainId_idx" ON "ProductPrices"("chainId");

-- CreateIndex
CREATE INDEX "ProductPrices_branchId_idx" ON "ProductPrices"("branchId");

-- CreateIndex
CREATE INDEX "ProductPrices_productId_idx" ON "ProductPrices"("productId");

-- CreateIndex
CREATE INDEX "ProductPrices_sourcePublishedAt_idx" ON "ProductPrices"("sourcePublishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrices_productId_branchId_key" ON "ProductPrices"("productId", "branchId");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_recordedAt_idx" ON "PriceHistory"("productId", "recordedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_branchId_productId_recordedAt_idx" ON "PriceHistory"("branchId", "productId", "recordedAt");

-- CreateIndex
CREATE INDEX "Promotions_endsAt_idx" ON "Promotions"("endsAt");

-- CreateIndex
CREATE INDEX "Promotions_chainId_idx" ON "Promotions"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Promotions_branchId_promotionCode_key" ON "Promotions"("branchId", "promotionCode");

-- CreateIndex
CREATE INDEX "PromotionItems_productId_idx" ON "PromotionItems"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionItems_promotionId_productId_key" ON "PromotionItems"("promotionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSources_chainId_url_key" ON "DataSources"("chainId", "url");

-- CreateIndex
CREATE INDEX "SourceFiles_kind_publishedAt_idx" ON "SourceFiles"("kind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFiles_dataSourceId_fileName_sha256_key" ON "SourceFiles"("dataSourceId", "fileName", "sha256");

-- CreateIndex
CREATE INDEX "ImportJobs_chainId_startedAt_idx" ON "ImportJobs"("chainId", "startedAt");

-- CreateIndex
CREATE INDEX "ConnectorChecks_chainId_checkedAt_idx" ON "ConnectorChecks"("chainId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItems_cartId_productId_key" ON "CartItems"("cartId", "productId");

-- AddForeignKey
ALTER TABLE "Branches" ADD CONSTRAINT "Branches_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Products" ADD CONSTRAINT "Products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImages" ADD CONSTRAINT "ProductImages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainItems" ADD CONSTRAINT "ChainItems_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainItems" ADD CONSTRAINT "ChainItems_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrices" ADD CONSTRAINT "ProductPrices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrices" ADD CONSTRAINT "ProductPrices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrices" ADD CONSTRAINT "ProductPrices_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrices" ADD CONSTRAINT "ProductPrices_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrices" ADD CONSTRAINT "ProductPrices_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotions" ADD CONSTRAINT "Promotions_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotions" ADD CONSTRAINT "Promotions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotions" ADD CONSTRAINT "Promotions_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionItems" ADD CONSTRAINT "PromotionItems_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionItems" ADD CONSTRAINT "PromotionItems_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSources" ADD CONSTRAINT "DataSources_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFiles" ADD CONSTRAINT "SourceFiles_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFiles" ADD CONSTRAINT "SourceFiles_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobs" ADD CONSTRAINT "ImportJobs_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobs" ADD CONSTRAINT "ImportJobs_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorChecks" ADD CONSTRAINT "ConnectorChecks_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SupermarketChains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorChecks" ADD CONSTRAINT "ConnectorChecks_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItems" ADD CONSTRAINT "CartItems_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "ShoppingCarts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItems" ADD CONSTRAINT "CartItems_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
