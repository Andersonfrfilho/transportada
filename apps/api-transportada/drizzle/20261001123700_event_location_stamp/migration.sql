-- Spec 196 D2 / ADR-0081 §2: o evento passa a dizer por que a coordenada não veio.
--
-- Recorte de execução: só as duas tabelas que já têm as quatro colunas de ponto
-- (`trip_stop_events` e `trip_delivery_proofs`). As três que não têm coluna nenhuma
-- (`trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences`) ficam para o resto
-- da spec — coluna de estado sem coluna de ponto não teria o que afirmar.
--
-- Aditiva e reversível: coluna anulável + dois CHECKs por tabela. Sem DEFAULT, sem NOT NULL
-- retroativo, sem destrutivo.
--
-- O backfill é só o que a D2 manda: `captured` onde já existe coordenada. Onde não existe, a linha
-- fica NULL **de propósito** — o banco não sabe se o GPS falhou ou se a app daquela época nem pedia
-- posição, e `unavailable` ali diria "falhou" sobre um toque que nunca tentou ler. Derivar o estado
-- do canal também não serve: `trip_stop_events.channel` é NOT NULL DEFAULT 'driver_app' e nunca
-- teve backfill, então todo evento pré-GPS apareceria vermelho na tela.
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN` anulável e sem default não reescreve a tabela — é só catálogo.
--   * O `UPDATE` do backfill toca apenas as linhas com coordenada e roda ANTES dos CHECKs, porque o
--     CHECK de consistência reprovaria a tabela com coordenada e estado nulo na validação.
--   * Todo CHECK entra `NOT VALID` e é validado em statement à parte: `ADD CONSTRAINT` validando
--     toma ACCESS EXCLUSIVE com varredura completa, enquanto `VALIDATE CONSTRAINT` toma só SHARE
--     UPDATE EXCLUSIVE e não barra leitura nem escrita.
--
-- O CHECK de consistência usa `is not distinct from` porque CHECK que avalia `NULL` **passa** em
-- Postgres: tanto `location_state is null or (...)` quanto `(location_state = 'captured') = (...)`
-- aceitam a linha com coordenada e estado nulo, que é exatamente a que ele existe para barrar.
ALTER TABLE "trip_stop_events" ADD COLUMN "location_state" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "location_state" varchar(16);--> statement-breakpoint
UPDATE "trip_stop_events" SET "location_state" = 'captured' WHERE "latitude" is not null;--> statement-breakpoint
UPDATE "trip_delivery_proofs" SET "location_state" = 'captured' WHERE "latitude" is not null;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_location_state_check" CHECK ("location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_events" VALIDATE CONSTRAINT "trip_stop_events_location_state_check";--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_location_state_consistency_check" CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_events" VALIDATE CONSTRAINT "trip_stop_events_location_state_consistency_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_location_state_check" CHECK ("location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_location_state_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_location_state_consistency_check" CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_location_state_consistency_check";
