-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('INFO', 'OPPORTUNITY', 'WARNING');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "region" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAlias" (
    "id" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "StoreAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storeId" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'UPLOADED',
    "imageKey" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "subtotalCents" INTEGER,
    "taxCents" INTEGER,
    "totalCents" INTEGER,
    "paymentMethod" TEXT,
    "rawExtraction" JSONB,
    "extractionModel" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "arithmeticOk" BOOLEAN,
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER,
    "extendedCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchMethod" TEXT,
    "categoryId" TEXT,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "gtin" TEXT,
    "sizeValue" DECIMAL(10,3),
    "sizeUom" TEXT,
    "baseUom" TEXT,
    "baseFactor" DECIMAL(12,6),
    "isStoreBrand" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "storeId" TEXT,
    "productId" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "pricePerBaseUom" DECIMAL(12,4) NOT NULL,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "receiptLineId" TEXT,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselinePrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "pricePerBaseUom" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaselinePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceIndexPoint" (
    "id" TEXT NOT NULL,
    "basketSlug" TEXT NOT NULL,
    "storeId" TEXT,
    "region" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "indexValue" DECIMAL(10,4) NOT NULL,
    "basketCostCents" INTEGER NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PriceIndexPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT,
    "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "amountCents" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "InsightSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "estimatedSavingsCents" INTEGER,
    "data" JSONB NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionUsage" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "receiptId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Store_name_address_key" ON "Store"("name", "address");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAlias_raw_key" ON "StoreAlias"("raw");

-- CreateIndex
CREATE INDEX "Receipt_householdId_purchasedAt_idx" ON "Receipt"("householdId", "purchasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_householdId_imageHash_key" ON "Receipt"("householdId", "imageHash");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptLine_productId_idx" ON "ReceiptLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_normalized_storeId_key" ON "ProductAlias"("normalized", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceObservation_receiptLineId_key" ON "PriceObservation"("receiptLineId");

-- CreateIndex
CREATE INDEX "PriceObservation_productId_storeId_observedAt_idx" ON "PriceObservation"("productId", "storeId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_productId_observedAt_idx" ON "PriceObservation"("productId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BaselinePrice_productId_region_effectiveOn_key" ON "BaselinePrice"("productId", "region", "effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "PriceIndexPoint_basketSlug_storeId_region_periodStart_key" ON "PriceIndexPoint"("basketSlug", "storeId", "region", "periodStart");

-- CreateIndex
CREATE INDEX "Insight_householdId_createdAt_idx" ON "Insight"("householdId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_householdId_dedupeKey_periodStart_key" ON "Insight"("householdId", "dedupeKey", "periodStart");

-- CreateIndex
CREATE INDEX "ExtractionUsage_householdId_createdAt_idx" ON "ExtractionUsage"("householdId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAlias" ADD CONSTRAINT "StoreAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "ReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselinePrice" ADD CONSTRAINT "BaselinePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
