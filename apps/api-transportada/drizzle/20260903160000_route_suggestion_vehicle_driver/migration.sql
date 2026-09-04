-- ADR-0055: o par veiculo <-> motorista da sugestao multi-veiculo.
--
-- A coluna e NULA de proposito. Toda linha ja gravada fica sem motorista, e o aceite delas continua
-- criando viagem sem tripulacao -- exatamente o comportamento anterior a esta migration.
ALTER TABLE "route_suggestion_vehicles"
	ADD COLUMN "driver_id" uuid;

-- A FK leva a empresa junto: a simples aceitaria escalar o motorista de outra transportadora.
ALTER TABLE "route_suggestion_vehicles"
	ADD CONSTRAINT "route_suggestion_vehicles_driver_fk"
	FOREIGN KEY ("company_id", "driver_id")
	REFERENCES "fleet_drivers"("company_id", "id")
	ON DELETE restrict ON UPDATE cascade;

-- O mesmo motorista em dois pares do mesmo pedido seriam duas viagens simultaneas dele no PWA.
-- NULL nao colide com NULL no Postgres, entao varios pares sem motorista continuam validos.
ALTER TABLE "route_suggestion_vehicles"
	ADD CONSTRAINT "route_suggestion_vehicles_suggestion_driver_unique"
	UNIQUE ("suggestion_id", "driver_id");

CREATE INDEX "route_suggestion_vehicles_company_driver_idx"
	ON "route_suggestion_vehicles" ("company_id", "driver_id");
