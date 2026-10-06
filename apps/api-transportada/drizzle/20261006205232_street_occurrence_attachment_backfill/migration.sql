-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 246 T1d.2 (RF1d): a foto da ocorrência de rua ganha a linha em
-- `trip_document_occurrence_attachments`, a tabela que a 161 criou para o galpão.
--
-- Deploy SEPARADO da T1.2 (`20261006205139_occurrence_type_requirement_modes`): o migrador roda tudo
-- numa transação, e o `ADD COLUMN signature_object_id` daquela seguraria ACCESS EXCLUSIVE em
-- `trip_document_occurrences` durante este INSERT. Antes de aplicar em produção: a medição da T1d.0.
--
-- - `created_at = o.created_at`: a linha do tempo usa o `created_at` do anexo como a hora do evento
--   de foto; o padrão `now()` moveria a foto para a hora do deploy.
-- - `NOT EXISTS`: ocorrência que já tem qualquer linha não ganha outra — pode haver anexo só na
--   posição 2, e o `ON CONFLICT` sozinho deixaria passar uma segunda foto na posição 1.
-- - `retention_until` não está nesta tabela: está em `stored_objects`, e o objeto é o mesmo.
-- - `attachment_object_id` permanece gravada até a leitura nova estar em produção.
-- - Um objeto servindo N ocorrências (lote do escritório, purpose `delivery_proof`) vira N linhas
--   com o mesmo `stored_object_id`; o expurgo da 161 supõe uma linha por objeto (plan § T1d.2).
-- - O id do anexo muda (id da ocorrência → id da linha) no feed, no painel e na linha do tempo.
INSERT INTO "trip_document_occurrence_attachments"
  ("company_id", "occurrence_id", "stored_object_id", "thumbnail_object_id", "position", "created_at")
SELECT o."company_id", o."id", o."attachment_object_id", NULL, 1, o."created_at"
FROM "trip_document_occurrences" o
WHERE o."attachment_object_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "trip_document_occurrence_attachments" a
    WHERE a."company_id" = o."company_id" AND a."occurrence_id" = o."id"
  )
ON CONFLICT ON CONSTRAINT "trip_document_occurrence_attachments_unique_position" DO NOTHING;
