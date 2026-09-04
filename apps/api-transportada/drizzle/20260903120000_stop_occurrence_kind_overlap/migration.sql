-- Tres valores saiam do catalogo de ocorrencia de PARADA porque nao sao da parada:
--   damaged_goods    -> e da nota, e ja e motivo de devolucao
--   address_not_found -> idem
--   customer_closed  -> e o mesmo fato que establishment_closed, com outro nome
--
-- MEDIDO EM 2026-09-03, nos dois ambientes: trip_stop_occurrences tem ZERO linhas, e producao tem
-- ZERO viagens. Nao ha dado para migrar, e por isso o CHECK encolhe em vez de conviver com valores
-- que a tela nao oferece mais.
ALTER TABLE "trip_stop_occurrences"
	DROP CONSTRAINT "trip_stop_occurrences_kind_check";

ALTER TABLE "trip_stop_occurrences"
	ADD CONSTRAINT "trip_stop_occurrences_kind_check"
	CHECK ("kind" IN ('unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'other'));

COMMENT ON COLUMN "trip_stop_occurrences"."kind" IS
	'O que aconteceu NA PARADA: espera, doca, cobranca, agendamento. O que e da carga ou do endereco nao entra aqui - avaria e endereco nao encontrado sao motivo de devolucao da nota, e estabelecimento fechado ja tem nome la. Tres vocabularios para o mesmo fato produziam dois registros do mesmo evento (spec 079).';
