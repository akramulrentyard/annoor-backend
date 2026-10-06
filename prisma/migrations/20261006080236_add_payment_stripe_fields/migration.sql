-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "is_renewal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_payment_method_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripe_customer_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "halal_places_expires_at_auto_renew_enabled_idx" ON "halal_places"("expires_at", "auto_renew_enabled");

-- CreateIndex
CREATE INDEX "payments_expires_at_is_renewal_idx" ON "payments"("expires_at", "is_renewal");

-- CreateIndex
CREATE INDEX "payments_stripe_customer_id_idx" ON "payments"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_place_id_action_created_at_idx" ON "subscriptions"("place_id", "action", "created_at");
