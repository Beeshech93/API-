-- CreateIndex
CREATE INDEX "transactions_client_id_environment_status_idx" ON "transactions"("client_id", "environment", "status");

-- CreateIndex
CREATE INDEX "fundings_client_id_environment_status_idx" ON "fundings"("client_id", "environment", "status");

