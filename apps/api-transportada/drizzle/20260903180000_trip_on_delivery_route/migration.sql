-- ADR-0058: a viagem na estrada, entre o toque de iniciar trajeto e a última nota fechada.
--
-- Puramente aditiva: o CHECK ganha um valor e nenhuma linha existente muda de estado. Viagem que
-- hoje está em `in_transit` continua em `in_transit` — quem a adianta é a próxima nota fechada, pela
-- derivação, não esta migration.
ALTER TABLE "trips" DROP CONSTRAINT "trips_status_check";--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled'));
