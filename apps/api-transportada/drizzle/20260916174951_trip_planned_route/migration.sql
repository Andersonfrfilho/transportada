-- Spec 153 D4: a rota escolhida nasce inteira numa única escrita — traçado, distância, volta e
-- duração compartilham `planned_route_frozen_at` com o pedágio (spec 090 T11, coluna já existente
-- e intocada aqui). Os dois CHECKs abaixo proíbem qualquer uma delas chegar sozinha ou negativa.
ALTER TABLE "trips" ADD COLUMN "planned_route" jsonb;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_distance_meters" bigint;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_return_distance_meters" bigint;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_duration_seconds" bigint;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_route_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_planned_route_check" CHECK (("planned_route" is null) = ("planned_route_frozen_at" is null)
        and ("planned_distance_meters" is null) = ("planned_route_frozen_at" is null)
        and ("planned_return_distance_meters" is null) = ("planned_route_frozen_at" is null)
        and ("planned_duration_seconds" is null) = ("planned_route_frozen_at" is null));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_planned_route_metrics_check" CHECK (("planned_distance_meters" is null or "planned_distance_meters" >= 0)
        and ("planned_return_distance_meters" is null or "planned_return_distance_meters" >= 0)
        and ("planned_duration_seconds" is null or "planned_duration_seconds" >= 0));
