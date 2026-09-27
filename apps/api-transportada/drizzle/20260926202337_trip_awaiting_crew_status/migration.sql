-- Spec 216: `awaiting_crew` entra na lista de status da viagem, antes de `draft`. Aditiva — a lista
-- antiga é subconjunto da nova (nenhuma linha existente viola), então NOT VALID + VALIDATE CONSTRAINT
-- em vez de DROP+ADD puro (ADR-0068 §3, molde de 20260918122304_trip_status_events): a varredura de
-- validação não segura ACCESS EXCLUSIVE contra escrita concorrente na tabela.
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_from_status_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_from_status_check" CHECK ("from_status" in ('awaiting_crew', 'draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_from_status_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_to_status_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_to_status_check" CHECK ("to_status" in ('awaiting_crew', 'draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_to_status_check";--> statement-breakpoint
ALTER TABLE "trips" DROP CONSTRAINT "trips_status_check";--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("status" in ('awaiting_crew', 'draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trips" VALIDATE CONSTRAINT "trips_status_check";
