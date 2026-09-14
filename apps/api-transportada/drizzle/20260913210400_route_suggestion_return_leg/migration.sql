-- A volta ao barracão de cada veículo da proposta — e o tempo da proposta passa a ser um só.
--
-- Decisão do usuário (2026-09-13): o cartão, a faixa do detalhe e a frase do mapa mostram o MESMO
-- número = estrada de ida + volta ao barracão (quando a política de retorno manda voltar) + tempo
-- parado de todas as entregas. O solver já somava a volta no custo (`readReturnLeg`), mas só a
-- perna "desde a anterior" de cada parada era gravada — a volta morria no worker.
--
-- ⚠️ Nulo é legítimo e é o passado: sugestão anterior a esta migration não tem a volta gravada, e
-- a API a declara desconhecida em vez de inventá-la. Nulo também é a política `last_stop` (não há
-- volta) e o par inalcançável na matriz.
alter table route_suggestion_vehicles
  add column return_distance_meters bigint,
  add column return_duration_seconds bigint;

alter table route_suggestion_vehicles
  add constraint route_suggestion_vehicles_return_leg_check
  check (
    (return_distance_meters is null or return_distance_meters >= 0)
    and (return_duration_seconds is null or return_duration_seconds >= 0)
  );

comment on column route_suggestion_vehicles.return_duration_seconds is
  'Volta da última entrega ao fim da rota, da mesma matriz do solver. Nulo: sem retorno ou desconhecida.';
