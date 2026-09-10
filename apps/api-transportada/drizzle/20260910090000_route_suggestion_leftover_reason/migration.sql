-- Por que a parada ficou de fora da distribuição — e a terceira razão nasce aqui.
--
-- A sobra existe desde a spec 107, e a razão era **derivada na tela**: parada sem veículo marcada
-- por precisão era "endereço impreciso"; qualquer outra virava "sem motorista que cubra a região".
-- Com o corte por capacidade (`capacity-trim.ts`), passa a existir uma terceira causa — a carga que
-- não coube no caminhão e ficou para a próxima viagem —, e ela é indistinguível das outras duas do
-- lado do cliente: as três chegam como `vehicle_id` nulo.
--
-- ⚠️ Rotular a carga que não coube como "sem motorista que cubra a região" mandaria o operador
-- cadastrar cobertura para resolver um problema de tonelagem. A razão passa a viajar.
--
-- ⚠️ Nulo é legítimo e é o passado: sugestão anterior a esta migration não tem razão gravada, e a
-- tela continua derivando como sempre derivou. Preencher retroativamente seria inventar a causa de
-- uma decisão que ninguém registrou.
alter table route_suggestion_stops
  add column leftover_reason text;

alter table route_suggestion_stops
  add constraint route_suggestion_stops_leftover_reason_check
  check (
    leftover_reason is null
    or leftover_reason in ('imprecise_location', 'not_covered', 'over_capacity')
  );

comment on column route_suggestion_stops.leftover_reason is
  'Por que a parada ficou sem veículo: endereço impreciso, sem cobertura, ou carga acima do teto.';
