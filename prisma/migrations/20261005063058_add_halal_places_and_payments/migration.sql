-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('pending_payment', 'pending_admin', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "plan_type" AS ENUM ('basic', 'premium', 'featured');

-- CreateTable
CREATE TABLE "halal_places" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "street_address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "photos" JSONB,
    "plan" "plan_type" NOT NULL DEFAULT 'basic',
    "status" "listing_status" NOT NULL DEFAULT 'pending_payment',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "halal_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "place_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "plan" "plan_type" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripe_session_id" TEXT,
    "stripe_payment_intent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "halal_places_status_idx" ON "halal_places"("status");

-- CreateIndex
CREATE INDEX "halal_places_category_idx" ON "halal_places"("category");

-- CreateIndex
CREATE INDEX "halal_places_city_idx" ON "halal_places"("city");

-- CreateIndex
CREATE INDEX "halal_places_owner_id_idx" ON "halal_places"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_session_id_key" ON "payments"("stripe_session_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_place_id_idx" ON "payments"("place_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "halal_places" ADD CONSTRAINT "halal_places_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halal_places" ADD CONSTRAINT "halal_places_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "halal_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
