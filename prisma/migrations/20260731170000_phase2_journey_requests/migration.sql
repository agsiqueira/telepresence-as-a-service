CREATE TYPE "JourneyRequestStatus" AS ENUM ('OPEN', 'WITHDRAWN', 'EXPIRED', 'CONVERTED');

CREATE TABLE "JourneyRequest" (
    "id" TEXT NOT NULL,
    "explorerId" TEXT NOT NULL,
    "destinationId" TEXT,
    "tripId" TEXT,
    "publicPlaceName" VARCHAR(120) NOT NULL,
    "coarseLocation" VARCHAR(120) NOT NULL,
    "privateMeetingDetails" VARCHAR(500),
    "earliestStart" TIMESTAMP(3) NOT NULL,
    "latestStart" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "proposedPriceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "JourneyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "withdrawnAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JourneyRequest_window_check" CHECK ("latestStart" > "earliestStart"),
    CONSTRAINT "JourneyRequest_duration_check" CHECK ("durationMinutes" BETWEEN 15 AND 480),
    CONSTRAINT "JourneyRequest_price_check" CHECK ("proposedPriceMinor" BETWEEN 0 AND 10000000),
    CONSTRAINT "JourneyRequest_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "JourneyRequest_expiration_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "latestStart"),
    CONSTRAINT "JourneyRequest_lifecycle_check" CHECK (
      ("status" = 'OPEN' AND "withdrawnAt" IS NULL AND "convertedAt" IS NULL AND "tripId" IS NULL) OR
      ("status" = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL AND "convertedAt" IS NULL AND "tripId" IS NULL) OR
      ("status" = 'EXPIRED' AND "withdrawnAt" IS NULL AND "convertedAt" IS NULL AND "tripId" IS NULL) OR
      ("status" = 'CONVERTED' AND "withdrawnAt" IS NULL AND "convertedAt" IS NOT NULL AND "tripId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "JourneyRequest_tripId_key" ON "JourneyRequest"("tripId");
CREATE INDEX "JourneyRequest_explorerId_createdAt_idx" ON "JourneyRequest"("explorerId", "createdAt");
CREATE INDEX "JourneyRequest_status_expiresAt_earliestStart_idx" ON "JourneyRequest"("status", "expiresAt", "earliestStart");
CREATE INDEX "JourneyRequest_coarseLocation_status_expiresAt_idx" ON "JourneyRequest"("coarseLocation", "status", "expiresAt");
CREATE INDEX "JourneyRequest_destinationId_idx" ON "JourneyRequest"("destinationId");

ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_explorerId_fkey" FOREIGN KEY ("explorerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JourneyRequest" ADD CONSTRAINT "JourneyRequest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
