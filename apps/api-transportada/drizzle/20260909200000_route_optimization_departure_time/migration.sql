-- Spec 109: a hora em que a frota sai.
--
-- O relógio do solver conta a partir da **meia-noite UTC** — 21h de Brasília do dia anterior. Sem
-- uma hora de partida, toda rota "saía" às 21h locais e as chegadas caíam de madrugada: medido em
-- 2026-09-09, cinco viagens propostas terminando às 03:04, 05:21, 07:03, 12:33 e 21:03.
--
-- ⚠️ Segundos desde a meia-noite **local**, não um `time`: o resto do bloco de roteirização já conta
-- em segundos (`default_service_time_seconds`, `max_duty_seconds_per_day`), e a conversão para o
-- fuso da operação já existe em `timezone`, ao lado.
--
-- O padrão é 08:00 porque é a hora em que a operação abre; é cadastro, não regra do produto
-- (ADR-0021), e a instalação que sai às 5h muda a linha.
alter table company_route_optimization_settings
  add column departure_time_seconds bigint not null default 28800;

alter table company_route_optimization_settings
  add constraint company_route_optimization_settings_departure_check
  check (departure_time_seconds between 0 and 86399);

comment on column company_route_optimization_settings.departure_time_seconds is
  'Hora de saída da frota, em segundos desde a meia-noite local (spec 109).';
