-- O catálogo de referência ganha carga máxima, e os dois tipos que faltavam (spec 093 RF1).
--
-- Medido em 2026-09-07, um dia depois de a spec 088 entrar: 3 de 12 veículos têm o baú medido, e
-- `three_quarter` — o tipo do RTD-5J78, que aparece em cinco das doze viagens da primeira página —
-- não tem linha neste catálogo. Ele escapa de a ocupação inteira desaparecer só porque alguém
-- digitou `capacity_m3 = 20` na ficha.
--
-- ⚠️ **As dimensões das sete linhas existentes NÃO são tocadas.** A pesquisa de mercado desta spec
-- devolveu números maiores que os semeados (VUC típico 4,200 × 2,100 × 2,150 contra os 3,150 ×
-- 1,900 × 2,200 daqui), e isso é o comportamento correto: a referência é PISO, nunca verdade. A
-- dispersão dentro de um tipo chega a 2× — a van vai de 7,0 a 15,5 m³ na mesma sigla —, e subir o
-- piso mudaria calado a ocupação de todo veículo sem ficha. Quem quiser o número maior mede o baú;
-- é para isso que a sugestão existe.
--
-- ⚠️ `max_payload_kg` é NULO quando não há fonte, e o CHECK recusa zero. Aqui a linha só existe
-- porque alguém publicou o número, e uma carga zerada afirmaria que o tipo não carrega nada — o
-- oposto de `fleet_vehicles`, onde zero significa "ninguém mediu".
ALTER TABLE "vehicle_volume_references"
	ADD COLUMN IF NOT EXISTS "max_payload_kg" numeric(10, 3);

ALTER TABLE "vehicle_volume_references"
	DROP CONSTRAINT IF EXISTS "vehicle_volume_references_payload_check";

ALTER TABLE "vehicle_volume_references"
	ADD CONSTRAINT "vehicle_volume_references_payload_check"
	CHECK ("max_payload_kg" > 0);

COMMENT ON COLUMN "vehicle_volume_references"."max_payload_kg" IS
	'Carga máxima publicada para o tipo. Sugere o `capacity_kg` da ficha no cadastro (spec 093); nulo é ausência de fonte, e zero é recusado pelo CHECK.';

-- As duas linhas que faltavam. `on conflict do nothing` porque a semente de catálogo é idempotente,
-- como a de `fuel_price_references`: reaplicar não duplica e não sobrescreve o que já está lá.
--
-- `three_quarter` sai da única fonte brasileira com medida INTERNA literal (Guia Log, baú de 4.000
-- kg: 5,320 × 2,080 × 2,200). Não é média entre `vuc` e `3/4` de propósito — metade das fontes do
-- mercado (TruckPad, bsoft) chama o VUC de "caminhão 3/4", e uma média entre as duas siglas
-- produziria um baú que não existe em nenhuma das duas.
--
-- `motorcycle` vem de bauleto de PEAD de 100 a 140 L, e a fonte é fraca: três revendas do MESMO
-- fabricante. O piso de 0,300 m do CHECK da ficha é justamente este baú.
INSERT INTO "vehicle_volume_references"
	("vehicle_type", "body_type", "cargo_length_m", "cargo_width_m", "cargo_height_m", "max_payload_kg")
VALUES
	('three_quarter', '02', 5.320, 2.080, 2.200, 4000.000),
	('motorcycle', '02', 0.570, 0.470, 0.570, 40.000)
ON CONFLICT ("vehicle_type", "body_type") DO NOTHING;

-- A carga das linhas que já existiam, no piso de cada faixa observada — mesmo critério das
-- dimensões. `car` e `tractor_unit` continuam sem linha: o carro de passeio não tem compartimento
-- de carga publicado (o que existe é volume de porta-malas, que é outra grandeza), e o cavalo
-- mecânico não tem baú próprio — o volume e a carga são do implemento.
UPDATE "vehicle_volume_references" SET "max_payload_kg" = 650.000
	WHERE "vehicle_type" = 'utility' AND "max_payload_kg" IS NULL;
UPDATE "vehicle_volume_references" SET "max_payload_kg" = 1200.000
	WHERE "vehicle_type" = 'van' AND "max_payload_kg" IS NULL;
UPDATE "vehicle_volume_references" SET "max_payload_kg" = 1500.000
	WHERE "vehicle_type" = 'vuc' AND "max_payload_kg" IS NULL;
UPDATE "vehicle_volume_references" SET "max_payload_kg" = 6000.000
	WHERE "vehicle_type" = 'toco' AND "max_payload_kg" IS NULL;
UPDATE "vehicle_volume_references" SET "max_payload_kg" = 10000.000
	WHERE "vehicle_type" = 'truck' AND "max_payload_kg" IS NULL;
