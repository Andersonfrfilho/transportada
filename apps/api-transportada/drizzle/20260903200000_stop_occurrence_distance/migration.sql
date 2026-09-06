-- ADR-0057 §2 e §3: a distancia entre onde o motorista estava e a parada, em metros inteiros.
--
-- NULL e "nao aferida", e e um estado — nao um erro. Parada sem coordenada (latitude e longitude
-- sao nulas no contrato de hoje) e posicao que nunca fixou caem aqui, e o escritorio ve que a
-- distancia nao pode ser medida em vez de ver uma distancia inventada.
--
-- Aditiva: a coluna nasce nula, e toda linha existente fica como nao aferida — que e a verdade
-- sobre ela, porque nenhuma ocorrencia anterior a esta migration mediu distancia nenhuma.
ALTER TABLE "trip_stop_occurrences"
	ADD COLUMN "reported_distance_meters" integer;

ALTER TABLE "trip_stop_occurrences"
	ADD CONSTRAINT "trip_stop_occurrences_distance_check"
	CHECK ("reported_distance_meters" IS NULL OR "reported_distance_meters" >= 0);

COMMENT ON COLUMN "trip_stop_occurrences"."reported_distance_meters" IS
	'Distancia em metros entre a posicao do motorista e a parada, no momento do relato. NULL e nao aferida: parada sem coordenada, ou posicao que nunca fixou. Distancia grande NAO invalida a ocorrencia - ela e informacao para quem decide, nunca porteiro (ADR-0057 secao 3).';
