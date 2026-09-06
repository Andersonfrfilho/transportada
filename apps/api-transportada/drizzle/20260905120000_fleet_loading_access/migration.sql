-- Por onde o veiculo carrega (spec 085 G003).
--
-- A ordem de carregamento so e camisa de forca em veiculo que abre so atras. Com porta lateral o
-- conferente alcanca o meio da carga, e o LIFO estrito deixa de ser obrigacao.
--
-- ⚠️ NAO se deduz do tipo do veiculo: a mesma Sprinter existe com e sem porta lateral, e deduzir
-- erraria justamente no veiculo que foge do estereotipo — o caso que faz alguem parar de confiar
-- na tela. O `body_type` (tpCar do MDF-e) semeia o valor inicial e nada mais.
--
-- ⚠️ O semeio e o mais RESTRITIVO possivel: bau fechado e desconhecido nascem 'rear'. Semear a
-- lateral por otimismo faria a tela dizer que da para alcancar o meio de uma carga que so abre
-- atras, e quem seguisse carregaria errado. Nenhum tpCar semeia 'rear_and_side' — a porta lateral
-- nao existe no layout do MDF-e e so entra digitada na ficha.
alter table fleet_vehicles
  add column loading_access text not null default 'rear';

-- 05 sider abre o comprimento inteiro pela lateral; 01 e carroceria aberta.
update fleet_vehicles set loading_access = 'open' where body_type in ('01', '05');

alter table fleet_vehicles
  add constraint fleet_vehicles_loading_access_check
  check (loading_access in ('rear', 'rear_and_side', 'open'));
