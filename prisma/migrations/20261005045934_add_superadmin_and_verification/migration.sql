-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'superadmin';

-- DropIndex
DROP INDEX "idx_otp_email";

-- DropIndex
DROP INDEX "idx_otp_expires";

-- DropIndex
DROP INDEX "idx_users_email";

-- AlterTable
ALTER TABLE "masjid_profiles" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" INTEGER,
ALTER COLUMN "contact_person" SET DATA TYPE TEXT,
ALTER COLUMN "phone" SET DATA TYPE TEXT,
ALTER COLUMN "website" SET DATA TYPE TEXT,
ALTER COLUMN "city" SET DATA TYPE TEXT,
ALTER COLUMN "state" SET DATA TYPE TEXT,
ALTER COLUMN "zip_code" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "otp_codes" ALTER COLUMN "email" SET DATA TYPE TEXT,
ALTER COLUMN "otp_code" SET DATA TYPE TEXT,
ALTER COLUMN "purpose" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "email" SET DATA TYPE TEXT,
ALTER COLUMN "password_hash" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "masjid_profiles" ADD CONSTRAINT "masjid_profiles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
