-- Spec 109 D2: a saída a que as horas das paradas estão ancoradas.
--
-- A hora de saída do planejamento é premissa (08:00, `departure_time_seconds`); a saída **real** é o
-- clique do motorista em `POST /me/current-trip/dispatch`. Até aqui as duas não se falavam: o ETA
-- congelava no aceite e nunca mais se mexia, então uma saída às 09:30 deixava toda a viagem
-- anunciando horas de 08:00 — plausíveis, e erradas por uma hora e meia.
--
-- ⚠️ São duas colunas porque são duas coisas. `route_suggestions.planned_departure_at` é o que o
-- solver supôs, e não muda mais: é a premissa sob a qual o operador aceitou. `trips.eta_departure_at`
-- é a saída a que as horas **de agora** estão ancoradas, e o despacho a reescreve — é isso que torna
-- o deslocamento idempotente, porque despachar de novo passa a ter diferença zero.
alter table route_suggestions
  add column planned_departure_at timestamp with time zone;

alter table trips
  add column eta_departure_at timestamp with time zone;

comment on column route_suggestions.planned_departure_at is
  'Saída suposta pelo solver — a premissa sob a qual o roteiro foi proposto (spec 109).';

comment on column trips.eta_departure_at is
  'Saída a que os ETAs das paradas estão ancorados; o despacho a reescreve com a saída real (spec 109).';
