-- Spec 344 T5d (D9): "Descartar" o alerta de canhoto de outra nota. O alerta continua derivado; esta
-- coluna só o apaga daquela foto. Aditiva: anulável, sem default e sem backfill (nulo é "o alerta vale").
-- `ADD COLUMN` anulável sem default só toca o catálogo; não reescreve a tabela.
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_mismatch_dismissed_at" timestamp with time zone;
