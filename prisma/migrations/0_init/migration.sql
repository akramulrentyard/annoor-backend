-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'masjid');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masjid_profiles" (
    "user_id" INTEGER NOT NULL,
    "address" TEXT,
    "contact_person" VARCHAR(255),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" VARCHAR(20),
    "website" VARCHAR(255),
    "street_address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "zip_code" VARCHAR(20),
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    CONSTRAINT "masjid_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "otp_code" VARCHAR(6) NOT NULL,
    "purpose" VARCHAR(50) NOT NULL,
    "payload" JSONB,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_users_email" ON "users"("email");
CREATE INDEX "idx_otp_email" ON "otp_codes"("email");
CREATE INDEX "idx_otp_expires" ON "otp_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "masjid_profiles" ADD CONSTRAINT "masjid_profiles_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
