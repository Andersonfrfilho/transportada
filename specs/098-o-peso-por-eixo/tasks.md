# Tasks

> 🤖 Modelo: `sonnet` (T3 é 🧠 — a conta de reação é onde a promessa da tela se decide)

## T0 — O modelo já existe ✅

`fleet_vehicle_axles` nasceu na migration `20260907190000_cargo_placement_properties` (spec 094) com
`position`, `distance_from_front_m` e `max_load_kg`. **Nada a criar.** Medido em 2026-09-08: zero
linhas, nenhum leitor, nenhuma tela — é isso que esta feature vem resolver.

## T1 — O catálogo de limites legais da Res. 882/2021

Tabela nova sem `company_id`, no molde de `vehicle_volume_references`, com **os limites do Art. 8º**
por configuração de conjunto de eixos, mais a norma e o ano (D5). Seed na própria migration.

⚠️ **Só o limite legal — nenhuma geometria por tipo.** A D2 recusou a referência de entre-eixos por
medição, e uma coluna de geometria aqui a reintroduziria pela porta dos fundos.

⚠️ **Eixo direcional isolado não vira linha**: a norma só trata do conjunto de dois direcionais, e o
isolado cai na regra geral de 2 ou 4 pneumáticos. Linha inventada aqui é lei inventada.
**Aceite:** D5, D6.
**Verificação:** `test/fleet-schema/tenant-safety.contract.ts` a lista como quarta exceção declarada.

## T2 — A ficha do veículo passa a cadastrar eixo, e é a única fonte

`fleet_vehicle_axles` ganha escrita pelas rotas de veículo, e o formulário da frota ganha a posição
de cada eixo (D2, D3). Não há sugestão por tipo: o entre-eixos do mesmo modelo varia 1,84 m.

⚠️ O número de eixos já existe no formulário (`axleCount`) e a tabela é por posição: os dois têm de
concordar, e a discordância é erro de fronteira, não correção silenciosa.

⚠️ **A tara repartida por eixo entra junto** (D1). Sem ela o veredito continua sendo carga por eixo,
e ela é o campo que a ficha técnica do fabricante publica — ao contrário do CG da tara, que ninguém
publica.
**Aceite:** D1, D2, D3.

## T3 🧠 — A conta, pura

`trips/domain/axle-load.policy.ts`: reação por eixo a partir das posições dos eixos e do centro de
massa da carga, que a planta já conhece (`PlacedBox.xM` e o peso da parada).

⚠️ **Ela devolve carga por eixo, não peso por eixo** — a tara não é repartida (D1), e o tipo, o nome
da função e o rótulo têm de dizer isso. Sem geometria devolve ausência, nunca estimativa (D4).
**Depende de:** T2. **Aceite:** D1, D4. **Verificação:** contrato reprova veredito numérico sem
geometria e rótulo sem a qualificação.

## T4 — A planta lê o veredito

`resolveCargoPlacement` troca `axleNotChecked` pelo resultado quando ele existe. A marca continua
sendo a saída padrão — a maioria da frota não tem eixo cadastrado, e vai continuar sem por um tempo.
**Depende de:** T3.

## T5 — ~~A aba Eixos~~ — cancelada pela D2

Era o pedido original: aba no molde de **Combustível** e **Pedágio**, listando tipos de veículo. A
medição do entre-eixos a esvaziou — sem referência por tipo que se sustente, a aba pediria um número
que não existe por tipo. A geometria mora na ficha (T2).

## T6 — A tela imprime a data da norma

O veredito sai com a norma e o ano, como a tarifa de pedágio imprime `observed_on`.
**Depende de:** T4, T5. **Aceite:** D5.
