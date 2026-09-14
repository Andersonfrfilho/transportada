-- A medida do baú ganha piso e teto, uma dimensão por vez (spec 088 G001).
--
-- As três colunas existem desde a spec 075 e a frota inteira está zerada: 8 de 8, medido em
-- 2026-09-06. Não é descuido do operador — o formulário da frota nunca ofereceu os campos. Esta
-- spec passa a pedi-los, e a partir daí a planta do baú é desenhada EM METROS, contra a fita de
-- quem carrega. Erro de ordem de grandeza deixa de ser um número estranho numa ficha e passa a ser
-- um desenho que mente sobre onde encostar a carga.
--
-- ⚠️ Zero continua sendo AUSÊNCIA, e por isso cada CHECK é uma disjunção: `= 0 or between piso e
-- teto`. Exigir o piso sem admitir zero reprovaria a frota que já está no banco.
--
-- ⚠️ Um CHECK POR DIMENSÃO, e não os três num só como o `fleet_vehicles_cargo_dimensions_check`
-- que este substitui: a recusa precisa nomear qual medida está fora. Com os três juntos, quem
-- digitou 2,5 cm de largura recebe a mesma mensagem de quem digitou 40 m de comprimento.
--
-- Os tetos são por dimensão porque as três não têm a mesma folga: o rodotrem chega perto dos 30 m
-- de comprimento, e nenhuma carroceria tem 30 m de largura. O piso de 0,300 m é o mesmo nas três —
-- é o baú de moto, a menor coisa que esta frota pode cadastrar.
ALTER TABLE "fleet_vehicles"
	DROP CONSTRAINT IF EXISTS "fleet_vehicles_cargo_dimensions_check";

ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_cargo_length_check"
	CHECK ("cargo_length_m" = 0 OR "cargo_length_m" BETWEEN 0.300 AND 30.000),
	ADD CONSTRAINT "fleet_vehicles_cargo_width_check"
	CHECK ("cargo_width_m" = 0 OR "cargo_width_m" BETWEEN 0.300 AND 4.000),
	ADD CONSTRAINT "fleet_vehicles_cargo_height_check"
	CHECK ("cargo_height_m" = 0 OR "cargo_height_m" BETWEEN 0.300 AND 5.000);

COMMENT ON COLUMN "fleet_vehicles"."cargo_width_m" IS
	'Largura interna do baú. Com o comprimento, desenha a planta em escala (spec 088 R2); zero é ausência de medida e a tela não desenha planta nenhuma.';

COMMENT ON COLUMN "fleet_vehicles"."cargo_height_m" IS
	'Altura interna do baú. Entra na planta só como quantas camadas cabem, em texto (spec 088 D1): vista de cima, nunca 3D.';
