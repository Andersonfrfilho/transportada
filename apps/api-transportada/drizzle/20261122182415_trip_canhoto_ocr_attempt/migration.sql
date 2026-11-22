-- Spec 344 D7 (T2): a segunda passada da rotina `trip.canhoto.read` (OCR do Nº/Série impresso)
-- ganha a coluna de tentativa própria e o índice parcial da fila dela.
--
-- Aditiva: a coluna nasce NULL e **sem backfill** — nulo é "o OCR ainda não tentou" —, e é isso que
-- põe na fila as ~470 provas que a passada do código de barras já carimbou em
-- `canhoto_read_attempted_at` (reaproveitar aquela coluna as deixaria fora para sempre).
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN` anulável sem default só toca o catálogo; não reescreve a tabela.
--   * `CREATE INDEX` toma SHARE sobre `trip_delivery_proofs` enquanto constrói, e escrita espera. O
--     predicado só indexa o pendente sem leitura (um conjunto pequeno), mas a varredura para
--     construí-lo é da tabela inteira. Fora do horário de campo, ou aceitar a espera.
--
-- ⚠️ O predicado usa literais (`= 'pending'`), sem `kind`, como o índice da passada do código de
-- barras: a consulta do worker (T4) repete os mesmos literais, ou o índice é ignorado em silêncio.
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_ocr_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "trip_delivery_proofs_canhoto_ocr_pending_idx" ON "trip_delivery_proofs" ("created_at") WHERE "canhoto_review" = 'pending' and "canhoto_read_source" is null and "canhoto_ocr_attempted_at" is null;