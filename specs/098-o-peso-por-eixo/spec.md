# Feature 098 — O peso por eixo

> Registrada em 2026-09-08, a partir de pedido do usuário depois de a planta da carga passar a
> equilibrar a carga ao longo do baú sem conferir eixo nenhum.

## Problema e resultado

A planta da carga (spec 094/095) posiciona cada caixa e **declara** que não conferiu eixo:
`axleNotChecked` está no vocabulário fechado de `PlacementReason` desde a 094, e a RF8 daquela spec
diz por escrito que sem eixo cadastrado a planta sai com essa marca — _"nunca com um veredito de peso
por eixo que ninguém pôde calcular"_.

Em 2026-09-08 a planta passou a **mover a carga** por causa do peso: acima de metade de
`capacity_kg` o bloco sai da porta e vai para o meio do baú (`weightBalanced`). Isso é posição
longitudinal, não carga por eixo — e a diferença precisa parar de ser só um comentário no código.
Esta feature é o que falta para a marca virar veredito.

**O modelo já existe e está vazio.** `fleet_vehicle_axles` foi criada pela migration
`20260907190000_cargo_placement_properties` (spec 094) com exatamente a geometria que a conta pede:

| coluna                  | o que é                                        |
| ----------------------- | ---------------------------------------------- |
| `position`              | ordem do eixo, 1..9                            |
| `distance_from_front_m` | distância da frente do veículo, `numeric(6,3)` |
| `max_load_kg`           | limite daquele eixo, nulo é "ninguém informou" |

Medido na base real em 2026-09-08, 14 veículos:

| dado                                | preenchido |
| ----------------------------------- | ---------: |
| `capacity_kg` (teto de massa)       |   12 de 14 |
| `tare_weight_kg` (tara)             |    6 de 14 |
| `axle_count` (quantos eixos)        |    6 de 14 |
| baú medido (as três dimensões)      |    5 de 14 |
| **linhas em `fleet_vehicle_axles`** |      **0** |

Zero linhas, nenhum leitor, nenhuma tela. A tabela nasceu e ficou parada — e é por isso que o
produto move carga por peso sem nunca dizer se ela cabe no eixo.

## Decisões

### D1 — A reação por eixo se calcula por momentos, e ela exige geometria que hoje não existe por veículo

A carga sobre cada eixo sai do equilíbrio de momentos: a massa (tara distribuída mais carga) apoiada
em pontos de apoio a distâncias conhecidas da frente. As entradas obrigatórias são **a posição de
cada eixo** (`distance_from_front_m`), **a posição longitudinal do centro de massa da carga** e **a
tara com sua própria distribuição**.

As duas primeiras o produto tem ou pode ter: a tabela existe, e a planta já sabe onde cada caixa está
(`PlacedBox.xM`). A terceira não: `fleet_vehicles.tare_weight_kg` é um número só, sem dizer como ela
se reparte entre os eixos.

⚠️ **Sem a repartição da tara, não existe kgf por eixo — existe kgf por eixo _da carga_.** As duas
coisas não são a mesma, e a fiscalização pesa a primeira. A decisão é calcular e **nomear** a
segunda, nunca apresentá-la como a primeira.

A conta é o equilíbrio de momentos numa viga de dois apoios — `W_traseiro = W · d_frente / L`,
`W_dianteiro = W − W_traseiro` —, e ela é **linear**: o certo é superposição, aplicá-la à tara com o
CG dela e a cada parcela de carga, somando as reações.

⚠️ **A fórmula não exige a repartição da tara; o resultado exige.** O CG da tara não é publicado, e
o caminho que os fabricantes usam é o inverso: pegar as **reações de tara por eixo** que a ficha
técnica publica — peso em ordem de marcha no dianteiro e no traseiro — como parcela já resolvida, e
aplicar a fórmula só à carga. Ou seja, `tare_weight_kg` como número único **não basta**, e o campo
que faltaria não é o CG: é a tara já repartida por eixo, que é o que existe em documento.

### D2 — Não existe referência de eixo por tipo de veículo, e medir isso mostrou por quê

A intenção era o molde de `vehicle_volume_references`: uma geometria típica por `vehicle_type`, piso
que a ficha vence. **A medição recusou o desenho.**

Entre-eixos publicado em ficha técnica de fabricante, 2026-09-08:

| tipo                       | entre-eixos de fábrica                          |
| -------------------------- | ----------------------------------------------- |
| VUC / 3-4 (Accelo 815 4x2) | 3,100 · 3,700 · 4,400 m                         |
| 3-4 maior (Accelo 1016)    | 3,100 · 3,900 · 4,600 m                         |
| **toco (Atego 1719 4x2)**  | **3,571 · 4,184 · 4,796 · 5,409 m**             |
| truck (Atego 2426 6x2)     | 3,550 · 4,775 · 5,388 m, mais 1,250 m no tandem |

⚠️ **A dispersão dentro de um único modelo é maior que a diferença entre siglas.** O Atego 1719 —
um caminhão, um modelo — sai de fábrica em quatro entre-eixos, de 3,571 a 5,409 m: **1,84 m de
amplitude**. O entre-eixos é escolhido pelo comprador conforme o implemento, e derivá-lo do tipo é
palpite com margem de **metros** num número que decide se a carga é legal.

É o mesmo argumento que a spec 088 usou para recusar a referência de volume como escala da planta
(um VUC de 13 e de 26 m³), com evidência mais forte: lá a dispersão era entre modelos, aqui é dentro
do mesmo modelo.

**A única fonte honesta é a ficha do veículo**, medida uma vez por caminhão — como o baú da 088. E o
CRLV não ajuda: ele imprime **peso** (PBT, CMT, tara, lotação), nunca a distância entre eixos.

⚠️ **Em três eixos o valor publicado são dois números**, não um: 1º→2º eixo e 2º→3º. `position` +
`distance_from_front_m` da tabela já comporta isso; um campo único de "entre-eixos" não comportaria.

### D3 — A tela é a ficha do veículo, não uma aba de referência

Decorre da D2. O pedido original era uma aba no molde de **Combustível** e **Pedágio** — as duas
corrigem referência de mercado por tipo. Sem referência de tipo que se sustente, essa aba não tem
conteúdo: ela listaria tipos e pediria um número que não existe por tipo.

A geometria entra na **ficha do veículo**, ao lado das três medidas do baú que a 088 acrescentou pelo
mesmo motivo e com o mesmo desconforto: alguém tem de medir. Frota de 14 veículos, uma vez cada.

⚠️ O contra-argumento — "preencha por tipo para não deixar em branco" — é exatamente o que a 093
mediu e recusou para a planta: sugestão de mercado vira metro na tela de quem confere com fita.

### D4 — Sem geometria, o veredito não existe; ele nunca é presumido

`axleNotChecked` continua sendo a saída padrão. Um veículo sem eixo na ficha e sem referência de tipo
não recebe estimativa: recebe a marca. Esta é a mesma regra do denominador ausente na ocupação e no
peso — `null`, nunca zero, nunca 100%.

### D5 — O limite legal é norma, e norma tem data

O limite por eixo e a tolerância de pesagem são de resolução do CONTRAN, e resolução muda. O valor
entra como catálogo com **a norma e o ano ao lado**, e a tela imprime a data junto do veredito — como
a tarifa de pedágio já imprime `observed_on`, pela mesma razão: número regulado sem data envelhece
calado.

⚠️ **Norma legal e referência de mercado não se misturam no mesmo campo.** O limite por conjunto de
eixos é lei; o entre-eixos típico de um toco é catálogo de fabricante. Guardá-los na mesma tabela sem
distinção faria uma correção de operador reescrever um limite legal.

### D6 — A norma é a Resolução CONTRAN 882/2021, e ela reordena a prioridade desta feature

A Resolução 210/2006 **está revogada** — o Art. 64, I da Res. CONTRAN **882/2021** (DOU 24/12/2021,
em vigor desde 03/01/2022) a revoga expressamente, junto com a 211/2006 e outras 24. Toda referência
a limite por eixo neste produto cita a 882/2021.

Limites do Art. 8º:

| conjunto                                                    | limite |
| ----------------------------------------------------------- | -----: |
| eixo isolado de 2 pneumáticos                               |    6 t |
| eixo isolado de 4 pneumáticos                               |   10 t |
| 2 eixos em tandem (distância > 1,20 m e ≤ 2,40 m)           |   17 t |
| 2 eixos **não** em tandem (mesma faixa)                     |   15 t |
| 3 eixos em tandem (só semirreboque, > 1,20 m e ≤ 2,40 m)    | 25,5 t |
| 2 eixos direcionais/autodirecionais, ≥ 1,20 m, 2 pneus cada |   12 t |

⚠️ **Eixo direcional isolado não tem linha própria na norma.** O texto trata do _conjunto_ de dois
direcionais; o direcional isolado cai na regra geral de 2 ou 4 pneumáticos. O catálogo não inventa
uma linha para ele.

Tolerâncias do Art. 50: **5%** sobre o PBT/PBTC e **12,5%** sobre o peso por eixo. O §3º diz que a
tolerância **não pode ser incorporada aos limites** no carregamento — então ela nunca entra na conta
que a tela mostra a quem está carregando; ela é margem de fiscalização, não de projeto.

⚠️ **E aqui está o achado que reordena esta feature.** O Art. 50 §1º manda fiscalizar veículo com
PBT/PBTC **até 50 t apenas pelo PBT/PBTC**; a conferência por eixo só entra (§2º) quando o total já
estourou. A frota desta base é inteira abaixo disso — VUC, 3/4, toco, truck. Para ela, **o critério
de autuação é o peso total, e o produto já o tem**: `payloadRatio`, que a planta já lê e o painel já
imprime.

Consequência honesta: a conferência por eixo vale para o **conjunto articulado** e para a carga que
já estourou o total — não é a proteção diária que o nome sugere. O que protege o dia a dia desta
frota é o teto de massa, que existe hoje e está preenchido em 12 de 14 veículos.

⚠️ **O Art. 49 §3º é o que mais toca este produto.** Na fiscalização pelo **peso declarado em NF-e,
CT-e ou manifesto**, **não se admite tolerância alguma**. O produto emite CT-e e MDF-e com peso
declarado — e ali o número não tem folga de 5% nem de 12,5%.

## Fora de escopo

- **Emissão de qualquer documento com base nesta conta.** O veredito é de tela, não de MDF-e nem de
  CT-e.
- **Bitrem, rodotrem e conjunto articulado.** `tractor_unit` é o cavalo; o conjunto que roda tem
  geometria do implemento, que esta base não cadastra (2 de 14 veículos são cavalo, os dois sem
  `capacity_kg`).
- **Conferência por eixo como proteção diária de frota abaixo de 50 t.** Ver D6: para ela a norma
  fiscaliza o total, não o eixo.
- **Reposicionar a carga para resolver o estouro.** A planta avisa; quem decide arrumação é quem
  carrega. Mover caixa por conta do eixo exigiria a repartição da tara que a D1 diz não existir.

## Contratos obrigatórios

- Veículo sem eixo cadastrado e sem referência de tipo sai com `axleNotChecked` — contrato reprova
  qualquer veredito numérico nesse caso.
- O veredito nomeia que é **carga por eixo**, não peso total por eixo, enquanto a tara não for
  repartida — contrato reprova o rótulo sem essa qualificação.
- A referência de tipo nunca vence a ficha do veículo.
- Correção de operador não escreve em tabela sem `company_id` — o mesmo contrato que `toll_booths` já
  tem.
- O limite legal carrega norma e ano, e a tela os imprime junto do veredito.
- A tolerância de fiscalização **nunca** é somada ao limite mostrado a quem carrega (Art. 50 §3º) —
  contrato reprova qualquer soma de 5% ou 12,5% no caminho da tela.
