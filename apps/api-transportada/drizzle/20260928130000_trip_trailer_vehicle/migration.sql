-- A carreta ganha coluna na viagem e na frota (spec 147 D3, T8).
--
-- `trips.trailer_vehicle_id` é a carreta que o cavalo puxa nesta viagem; `fleet_vehicles.
-- default_trailer_vehicle_id` é a carreta que este cavalo puxa por padrão, sugestão que a T10
-- copia para a viagem nova. As duas nascem nulas: nenhum cavalo de hoje tem carreta declarada, e
-- viagem sem carreta continua montável e planejável — só não despacha (`TRIP_TRAILER_REQUIRED`,
-- T11, fora do escopo desta migration).
ALTER TABLE "fleet_vehicles"
	ADD COLUMN IF NOT EXISTS "default_trailer_vehicle_id" uuid;

ALTER TABLE "trips"
	ADD COLUMN IF NOT EXISTS "trailer_vehicle_id" uuid;

-- ⚠️ Auto-referente, pela mesma `fleet_vehicles_company_id_id_unique`. `restrict`/`cascade`, nunca
-- `SET NULL` — numa FK composta ele anularia também `company_id`, que é NOT NULL.
ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_company_default_trailer_fk"
	FOREIGN KEY ("company_id","default_trailer_vehicle_id") REFERENCES "public"."fleet_vehicles"("company_id","id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "trips"
	ADD CONSTRAINT "trips_company_trailer_vehicle_fk"
	FOREIGN KEY ("company_id","trailer_vehicle_id") REFERENCES "public"."fleet_vehicles"("company_id","id")
	ON DELETE restrict ON UPDATE cascade;

-- Só o cavalo mecânico tem carreta padrão a apontar.
ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_default_trailer_tractor_only"
	CHECK ("default_trailer_vehicle_id" IS NULL OR "vehicle_type" = 'tractor_unit');

-- A carreta padrão não pode ser o próprio veículo.
ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_default_trailer_not_self"
	CHECK ("default_trailer_vehicle_id" IS NULL OR "default_trailer_vehicle_id" <> "id");

-- A carreta não pode ser o próprio veículo tracionado.
ALTER TABLE "trips"
	ADD CONSTRAINT "trips_trailer_not_vehicle"
	CHECK ("trailer_vehicle_id" IS NULL OR "trailer_vehicle_id" <> "vehicle_id");

-- ⚠️ Uma carreta não entra em duas viagens abertas ao mesmo tempo. São nove estados
-- (`trip-state.policy.ts`); os dois terminais (`completed`, `cancelled`) não regridem, e são os
-- únicos de fora — quem já entregou ou cancelou libera a carreta.
CREATE UNIQUE INDEX IF NOT EXISTS "trips_company_trailer_open_unique"
	ON "trips" ("company_id","trailer_vehicle_id")
	WHERE "trailer_vehicle_id" IS NOT NULL AND "status" NOT IN ('completed', 'cancelled');
