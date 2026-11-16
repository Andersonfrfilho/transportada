-- Spec 323 T4: a origem da ordem das paradas (`unordered | suggested | manual`) e o código da última falha do ordenador.
-- Aditiva: viagem existente nasce `unordered` e não é reordenada retroativamente (RF6).
ALTER TABLE "trips" ADD COLUMN "stop_order_source" text DEFAULT 'unordered' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "stop_order_error_code" text;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_stop_order_source_check" CHECK ("stop_order_source" in ('unordered', 'suggested', 'manual'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_stop_order_error_code_check" CHECK ("stop_order_error_code" is null or "stop_order_error_code" in ('ROUTING_MATRIX_UNAVAILABLE', 'ROUTING_DEPOT_NOT_GEOCODED', 'ROUTING_TOO_MANY_STOPS'));
