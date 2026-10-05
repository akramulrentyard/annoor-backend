ALTER TABLE "plans" RENAME COLUMN "duration" TO "duration_days";

ALTER TABLE "plans" 
  ADD COLUMN "auto_renew_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "halal_places" 
  ADD COLUMN "auto_renew_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auto_renew_cancelled_at" TIMESTAMP(3),
  ADD COLUMN "renewed_at" TIMESTAMP(3),
  ADD COLUMN "renewal_count" INTEGER NOT NULL DEFAULT 0;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_action') THEN
    CREATE TYPE "subscription_action" AS ENUM (
      'created', 'renewed', 'upgraded', 'downgraded', 
      'cancelled', 'expired', 'reactivated'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" SERIAL NOT NULL,
  "place_id" INTEGER NOT NULL,
  "plan_id" INTEGER,
  "action" "subscription_action" NOT NULL,
  "previous_plan" TEXT,
  "new_plan" TEXT,
  "amount_cents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_subscriptions_place_id" ON "subscriptions"("place_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_action" ON "subscriptions"("action");

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_place_id_fkey') THEN
    ALTER TABLE "subscriptions" 
      ADD CONSTRAINT "subscriptions_place_id_fkey" 
      FOREIGN KEY ("place_id") REFERENCES "halal_places"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_fkey') THEN
    ALTER TABLE "subscriptions" 
      ADD CONSTRAINT "subscriptions_plan_id_fkey" 
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") 
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
