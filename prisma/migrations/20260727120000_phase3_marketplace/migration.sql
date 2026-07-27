-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL, "city" TEXT NOT NULL, "meetingArea" TEXT NOT NULL,
    "category" TEXT NOT NULL, "durationOptions" INTEGER[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true, "imageUrl" TEXT, "custom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorProfile" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "operatingArea" TEXT NOT NULL,
    "serviceRadiusKm" DOUBLE PRECISION NOT NULL, "supportsCustom" BOOLEAN NOT NULL DEFAULT false,
    "languages" TEXT[] NOT NULL, "accessibilityCapabilities" TEXT[] NOT NULL,
    "durationOptions" INTEGER[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OperatorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorDestination" (
    "operatorId" TEXT NOT NULL, "destinationId" TEXT NOT NULL,
    CONSTRAINT "OperatorDestination_pkey" PRIMARY KEY ("operatorId", "destinationId")
);

CREATE TABLE "TripOffer" (
    "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "operatorId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'OFFERED', "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "respondedAt" TIMESTAMP(3),
    CONSTRAINT "TripOffer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Trip" ADD COLUMN "offeredOperatorId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "destinationId" TEXT;
ALTER TABLE "Trip" ADD COLUMN "operatingArea" TEXT;
ALTER TABLE "Trip" ADD COLUMN "meetingArea" TEXT;
ALTER TABLE "Trip" ADD COLUMN "requestedDuration" INTEGER;
ALTER TABLE "Trip" ADD COLUMN "viewerNote" TEXT;
ALTER TABLE "Trip" ADD COLUMN "preferredLanguage" TEXT;
ALTER TABLE "Trip" ADD COLUMN "accessibilityNeeds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Trip" ADD COLUMN "customDestination" TEXT;
ALTER TABLE "Trip" ADD COLUMN "immediate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Trip" ADD COLUMN "offerExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingOfferTripId" TEXT;
ALTER TABLE "User" ADD COLUMN "activeTripId" TEXT;

CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");
CREATE INDEX "Destination_active_category_idx" ON "Destination"("active", "category");
CREATE UNIQUE INDEX "OperatorProfile_userId_key" ON "OperatorProfile"("userId");
CREATE INDEX "OperatorDestination_destinationId_idx" ON "OperatorDestination"("destinationId");
CREATE UNIQUE INDEX "TripOffer_tripId_operatorId_key" ON "TripOffer"("tripId", "operatorId");
CREATE INDEX "TripOffer_operatorId_status_expiresAt_idx" ON "TripOffer"("operatorId", "status", "expiresAt");
CREATE INDEX "Trip_offeredOperatorId_status_offerExpiresAt_idx" ON "Trip"("offeredOperatorId", "status", "offerExpiresAt");
CREATE INDEX "Trip_destinationId_idx" ON "Trip"("destinationId");
CREATE INDEX "User_pendingOfferTripId_idx" ON "User"("pendingOfferTripId");
CREATE INDEX "User_activeTripId_idx" ON "User"("activeTripId");

ALTER TABLE "OperatorProfile" ADD CONSTRAINT "OperatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatorDestination" ADD CONSTRAINT "OperatorDestination_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatorDestination" ADD CONSTRAINT "OperatorDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_offeredOperatorId_fkey" FOREIGN KEY ("offeredOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
