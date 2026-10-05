-- CreateIndex
CREATE INDEX "subscriptions_created_at_idx" ON "subscriptions"("created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_subscriptions_action" RENAME TO "subscriptions_action_idx";

-- RenameIndex
ALTER INDEX "idx_subscriptions_place_id" RENAME TO "subscriptions_place_id_idx";
