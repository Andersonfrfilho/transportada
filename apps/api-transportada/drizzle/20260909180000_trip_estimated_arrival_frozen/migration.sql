-- Spec 107 D3: quando o ETA das paradas foi calculado.
--
-- O ETA nasce na **sugestão** e, até esta migration, morria nela: `route_suggestion_stops` tinha 873
-- de 950 paradas com hora estimada, e `trip_stops` tinha **0 de 869**. Não existia hora de término
-- de viagem em lugar nenhum do sistema.
--
-- ⚠️ **A hora envelhece, e a coluna existe para dizer isso.** O ETA congela no instante em que a
-- rota foi planejada: às 14h ele ainda diz o que achava às 7h. Sem o carimbo, a tela mostraria uma
-- hora que parece previsão de agora — que é o número plausível sem aviso que este produto recusa.
--
-- Segue o molde de `planned_toll` / `planned_toll_frozen_at`: o valor numa tabela e o instante em
-- que ele foi congelado ao lado. Sem CHECK aqui porque o par atravessa duas tabelas — o valor vive
-- em `trip_stops` e o carimbo na viagem, que é onde o planejamento acontece.
alter table trips
  add column estimated_arrival_frozen_at timestamp with time zone;

comment on column trips.estimated_arrival_frozen_at is
  'Instante em que o ETA das paradas foi calculado; a hora envelhece a partir dele (spec 107).';
