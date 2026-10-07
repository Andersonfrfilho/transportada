-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 (revisão de segurança da Fase 4a, S3): o perfil passa a guardar o TEXTO que antecede o
-- número da carga no `infCpl` (`arrival_reference_label`, literal, 1..60, sem controle) em vez de uma
-- expressão regular do usuário, que retrocedia. Aditiva: `arrival_reference_pattern` fica, sem uso
-- (deprecada), e não é apagada nesta rodada. Nenhum valor é copiado: a expressão antiga não vira
-- texto com segurança, e o perfil sem texto segue sem carga (o vínculo por conteúdo continua).
-- Lock: ACCESS EXCLUSIVE breve em `contractor_receiving_profiles` (coluna nula, sem reescrita).
ALTER TABLE "contractor_receiving_profiles" ADD COLUMN "arrival_reference_label" text;--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_arrival_reference_label_check" CHECK (char_length("arrival_reference_label") between 1 and 60 and "arrival_reference_label" !~ '[[:cntrl:]]');