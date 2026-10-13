-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 264 (revisão da T3.4, M5): o expurgo do texto da transcrição parte das linhas `ready` com texto, e este
-- índice parcial as separa das pendentes e falhas. Aditivo; a tabela é pequena (uma linha por áudio), então o
-- `CREATE INDEX` com SHARE é barato.
CREATE INDEX "occurrence_conversation_audio_transcriptions_purge_idx" ON "occurrence_conversation_audio_transcriptions" ("company_id","attachment_id") WHERE "status" = 'ready' and "text" is not null;
