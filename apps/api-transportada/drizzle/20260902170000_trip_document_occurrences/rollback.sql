-- Devolve o schema ao estado anterior. ⚠️ As ocorrencias registradas se perdem: a tabela e
-- append-only e nao ha para onde copiar o que ela guardava.
DROP TABLE IF EXISTS "trip_document_occurrences";
