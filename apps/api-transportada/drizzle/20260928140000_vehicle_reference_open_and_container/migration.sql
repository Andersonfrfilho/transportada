-- Duas carrocerias que o catálogo não sabia medir: o toco aberto (`01`) e o porta-contêiner
-- (`04`, cavalo e carreta) — spec 147.
--
-- ⚠️ **A altura do toco aberto é CONVENÇÃO, não medida de fabricante.** Não existe norma que
-- defina altura de carga em carroceria sem teto (a amarração é o que a CONTRAN 945/2022 exige, não
-- a altura). O comprimento e a largura, e a carga de 10.685 kg, saem da
-- [SINAPI 89265](https://orcamentor.com/composicao/89265/). Os 2,500 m de altura se apoiam em três
-- pontos, nenhum deles norma:
--   - anúncio de mercado (Fullex): toco aberto de 6,00 × 2,50 m com 38 m³, o que dá ≈ 2,53 m;
--   - teto legal com carga é 4,40 m (CONTRAN 882/2021); com o assoalho a ≈ 1,30 m (Guia Log), a
--     folga é de uns 3,10 m, e 2,50 m cabem com folga;
--   - dois paletes PBR empilhados.
-- Subir este número sem medir mudaria calado a ocupação de todo toco aberto sem ficha — a
-- referência é piso, nunca verdade, e o motivo de ela existir aqui é justamente a ausência de
-- medida publicada de fabricante para esta carroceria.
--
-- O contêiner é medida de fabricante, sem convenção nenhuma: 40' dry para a carreta (`vehicle_type`
-- vazio — o implemento é quem carrega o contêiner, não o cavalo) e 20' dry para o truck, os dois
-- pela ficha da DSV, conferida contra a Guia Log.
--
-- Granelera (`03`), carroceria aberta de truck/3/4/VUC/carreta e qualquer linha com `00` ficam de
-- fora: sem medida de fabricante publicada, e `00` não é carroceria — é a carreta que ainda não
-- declarou a dela.
INSERT INTO "vehicle_volume_references"
	("vehicle_type", "body_type", "cargo_length_m", "cargo_width_m", "cargo_height_m", "max_payload_kg")
VALUES
	('toco', '01', 7.000, 2.500, 2.500, 10685.000),
	('', '04', 12.030, 2.350, 2.390, 27600.000),
	('truck', '04', 5.900, 2.350, 2.390, 25000.000)
ON CONFLICT ("vehicle_type", "body_type") DO NOTHING;
