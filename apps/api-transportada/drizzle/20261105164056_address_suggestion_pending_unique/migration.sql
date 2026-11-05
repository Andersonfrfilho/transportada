-- Spec 294 S9 (revisão final): uma sugestão de endereço pendente por (empresa, endereço); a chegada seguinte atualiza a
-- pendente. Aditiva: só cria um índice parcial. A tabela nasceu na 20261105121000, ainda sem dado fora do ambiente local.
CREATE UNIQUE INDEX "address_correction_suggestions_company_address_pending_unique" ON "address_correction_suggestions" ("company_id","address_key") WHERE "status" = 'pending';
