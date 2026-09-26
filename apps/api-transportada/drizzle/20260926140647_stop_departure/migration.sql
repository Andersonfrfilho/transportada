-- Spec 206 (ADR-0088): a rota começa em cada parada.
--
-- Aditiva por inteiro. As duas colunas de "a caminho" nascem nulas, então os dois CHECKs novos valem
-- para toda linha existente sem varredura que recuse nada, e o índice único é parcial sobre o não
-- nulo — nenhuma parada antiga entra nele. API velha convive com este schema sem perceber.
--
-- Os **dois** kinds da saída entram aqui, na mesma migration: `departed` e `departure_cancelled`.
-- Recriar o CHECK de `kind` duas vezes, em duas migrations, seria trabalho e risco de graça.
ALTER TABLE "trip_field_reports" ADD COLUMN "result_changed" boolean;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "tapped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "en_route_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "en_route_tapped_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stops_one_en_route_per_trip_idx" ON "trip_stops" ("company_id","trip_id") WHERE "en_route_since" is not null;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_en_route_open_check" CHECK ("en_route_since" is null or ("arrived_at" is null and "completed_at" is null));--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_en_route_tapped_check" CHECK ("en_route_tapped_at" is null or "en_route_since" is not null);--> statement-breakpoint
-- ADR-0068 §3, no molde de `20260918122304_trip_status_events`: NOT VALID + VALIDATE CONSTRAINT em vez
-- de DROP+ADD — a lista antiga é subconjunto da nova (nenhuma linha viola), e assim a varredura não
-- segura ACCESS EXCLUSIVE durante o scan.
ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_kind_check";--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_kind_check" CHECK ("kind" in ('arrived', 'delivered', 'returned', 'occurrence', 'departed', 'departure_cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_events" VALIDATE CONSTRAINT "trip_stop_events_kind_check";
