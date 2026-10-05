/*
  Warnings:

  - You are about to drop the column `plan` on the `halal_places` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "halal_places" DROP COLUMN "plan",
ADD COLUMN     "plan_code" TEXT,
ADD COLUMN     "plan_duration" INTEGER,
ADD COLUMN     "plan_features" JSONB,
ADD COLUMN     "plan_id" INTEGER,
ADD COLUMN     "plan_name" TEXT,
ADD COLUMN     "plan_price_cents" INTEGER;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "plan",
ADD COLUMN     "plan_code" TEXT,
ADD COLUMN     "plan_id" INTEGER,
ADD COLUMN     "plan_name" TEXT;

-- DropEnum
DROP TYPE "plan_type";

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "duration" INTEGER NOT NULL,
    "features" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_is_active_idx" ON "plans"("is_active");

-- CreateIndex
CREATE INDEX "plans_code_idx" ON "plans"("code");

-- CreateIndex
CREATE INDEX "halal_places_plan_id_idx" ON "halal_places"("plan_id");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "halal_places" ADD CONSTRAINT "halal_places_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
