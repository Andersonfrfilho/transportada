-- Um default de baú para **cada tipo de veículo**, e para a carroceria sider.
--
-- A referência cobria sete tipos em `02` (baú/furgão fechado) e **nenhum** tipo de tração em `05`
-- (sider): um toco sider não achava referência nenhuma, e a ficha nascia vazia. O sider repete as
-- medidas internas do fechado do mesmo porte — a lona muda a parede, não o vão —, que é o mesmo
-- precedente que o implemento já usava, com `02` e `05` idênticos desde a spec 075.
--
-- ⚠️ **A referência é piso, e continua sendo.** Ela dá origem à sugestão da ficha e, desde a
-- 2026-09-10, à escala da planta **marcada como catálogo** na tela. Subir estes números sem medir
-- mudaria calado a ocupação de todo veículo sem ficha, e por isso as linhas antigas não foram
-- tocadas.
--
-- ⚠️ **`tractor_unit` e `other` continuam de fora, por decisão.** O cavalo mecânico não tem baú
-- próprio — o volume é do implemento que ele traciona, e é a linha de `vehicle_type = ''` que
-- responde por ele. E `other` é, por definição, o que o catálogo não sabe nomear: um default ali
-- seria inventar a medida de um veículo que ninguém declarou qual é.
insert into vehicle_volume_references
  (vehicle_type, body_type, cargo_length_m, cargo_width_m, cargo_height_m, max_payload_kg)
values
  -- O sider de cada porte, espelhando o fechado.
  ('motorcycle',    '05', 0.570,  0.470, 0.570,   40.000),
  ('utility',       '05', 1.700,  1.300, 1.400,  650.000),
  ('van',           '05', 3.200,  1.650, 1.900, 1200.000),
  ('vuc',           '05', 3.150,  1.900, 2.200, 1500.000),
  ('three_quarter', '05', 5.320,  2.080, 2.200, 4000.000),
  ('toco',          '05', 7.000,  2.500, 2.400, 6000.000),
  ('truck',         '05', 8.900,  2.500, 2.400, 10000.000),
  -- O carro de passeio em serviço de entrega: o porta-malas, que é o que ele tem.
  ('car',           '02', 1.000,  0.900, 0.500,   80.000),
  ('car',           '05', 1.000,  0.900, 0.500,   80.000)
on conflict (vehicle_type, body_type) do nothing;
