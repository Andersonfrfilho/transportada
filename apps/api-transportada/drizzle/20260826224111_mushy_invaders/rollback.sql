-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 066 fase 1: o que o OCR leu deixa de ser guardado no documento do agregado.
--
-- Perda de dado: a coluna guarda a leitura do OCR feita no upload, e ela não é reconstruível sem
-- reprocessar os arquivos. A revisão manual continua funcionando sem ela — volta a ser o
-- comportamento anterior, em que a divergência só existia no instante do envio.

ALTER TABLE "aggregate_documents" DROP COLUMN IF EXISTS "extracted_fields";
