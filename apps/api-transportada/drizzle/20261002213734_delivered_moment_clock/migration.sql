-- Spec 232 D3/D4 (T1.5): o evento do motorista guarda a hora do toque corrigida pelo desvio do
-- relógio, e o momento da entrega da nota e da pontualidade passa a ser
-- `coalesce(occurred_at, captured_at, recorded_at)`.
--
-- Aditiva: três colunas anuláveis, sem DEFAULT e **sem backfill** — evento e foto anteriores não têm
-- desvio medido, e o veredito já gravado não é recalculado (risco 6). `occurred_at` e
-- `clock_offset_ms` só nascem quando a correção foi aceita (`resolveOccurredAt` → `corrected`): a
-- decisão fica gravada, e uma correção descartada nunca volta a valer numa leitura em SQL.
--
-- `clock_offset_ms` é `bigint`: o desvio não tem teto no esquema (qualquer inteiro seguro é aceito;
-- `resolveOccurredAt` descarta o absurdo), e `integer` estoura em ±24,8 dias — o `22003` derrubaria o
-- toque do motorista em vez de só descartar a correção.
--
-- O índice é novo e o antigo (`trip_stop_events_company_delivered_at_idx`) fica só para o ROLLBACK: a
-- API velha ainda filtra por `coalesce(captured_at, recorded_at)` e precisa dele. Deve ser dropado numa
-- migration futura, depois de a API estabilizar. A expressão do novo é a de `deliveredMomentSql`, que o
-- schema TS usa para montar este índice.
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN` anulável e sem default só toca o catálogo; não reescreve a tabela.
--   * `CREATE INDEX` toma SHARE sobre `trip_stop_events` enquanto constrói, e escrita é bloqueada. O
--     predicado só indexa `delivered`, mas a varredura para construí-lo é da tabela inteira. A API em
--     pé tem `statement_timeout` de 8 s: se a construção passar disso, o INSERT do motorista FALHA
--     (57014) e o app reenvia — nada se perde. O migrator roda em transação, então `CONCURRENTLY` não
--     cabe aqui; faça o deploy fora do horário de campo.
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "clock_offset_ms" bigint;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "clock_offset_ms" bigint;--> statement-breakpoint
CREATE INDEX "trip_stop_events_company_delivered_moment_idx" ON "trip_stop_events" ("company_id",coalesce("occurred_at", "captured_at", "recorded_at")) WHERE "kind" = 'delivered';