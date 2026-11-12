-- Spec 294 T3.3 (RF26): índice parcial para achar o canhoto repetido pelo hash do conteúdo. Aditiva: só cria um índice.
CREATE INDEX "stored_objects_company_sha256_delivery_proof_idx" ON "stored_objects" ("company_id","sha256") WHERE "purpose" = 'delivery_proof';
