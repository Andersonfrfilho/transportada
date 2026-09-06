# Feature 088 — Onde encostar a carga

## Problema e resultado

A spec 085 respondeu **"cabe, e em que ordem entra"**: o painel da tela Nova viagem divide o baú em
fileiras proporcionais e diz qual parada carrega primeiro. Quem está no chão do galpão faz a
pergunta seguinte, e ela não tem resposta hoje: **"onde eu encosto a carga de cada entrega?"**

Fileira é proporção, não lugar. Ela não tem metro, não tem largura, e não diz se a carga da terceira
parada ocupa meio metro ou dois metros e meio de baú. O resultado desta feature é a **planta do baú
em escala** — vista de cima, com as medidas reais do veículo — em que cada entrega é uma faixa com
profundidade em metros, na ordem inversa da descarga, e com a lateral marcada quando ela é alcançável.

Quem carrega passa a poder medir com a fita o que a tela mostra.

## O que foi medido

Medido em 2026-09-06, na base local com a frota e as 345 NF-e reais:

| medida                                  | resultado                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Veículos com dimensão de baú preenchida | **0 de 8** — `cargo_length_m`, `cargo_width_m` e `cargo_height_m` zerados em todos |
| Veículos com `capacity_m3` digitado     | 4 (42, 28, 20 e 16 m³)                                                             |
| Referências de mercado com dimensão     | 5 chaves: `vuc`, `toco`, `truck`, `utility`, `van`, mais a carreta pelo implemento |
| Tipos da frota **sem** referência       | `three_quarter` (existe na frota, com 20 m³ declarados) e todo `body_type = '00'`  |
| Caixas medidas pelo conferente          | **6 de 663**                                                                       |

## A descoberta que ordena o resto

**A ficha do veículo nunca pediu as três medidas.** As colunas existem no banco desde a spec 075,
`resolveVehicleCapacity` as prefere a qualquer outra fonte, e o formulário da frota pergunta apenas
`Capacidade (m³)`. Não é dado faltando por descuido do operador: é campo que a tela nunca ofereceu.

Isso inverte o que parecia ser o caminho. A tentação era desenhar a partir da referência de mercado
por tipo — e ela existe, e serve de piso —, mas a referência erra por construção: a dispersão dentro
de um tipo chega a **2×** (um VUC existe de 13 e de 26 m³, conforme o CLAUDE.md já registra). Desenhar
a planta de um baú específico com a medida média do tipo é dizer ao conferente, em metros, uma coisa
que a fita dele vai desmentir.

**E elas não chegam por nenhum caminho automático** — conferido nos dois que existem neste
repositório, em 2026-09-06:

- **CRLV.** `CrlvValues` do `@adatechnology/document-intake` entrega treze campos — placa, RENAVAM,
  marca, modelo, ano, cor, combustível, carroceria, eixos, município, UF e o par nome/documento do
  proprietário. Nenhuma dimensão. Não é falha do parser: o CRLV imprime **peso** (PBT, CMT, tara,
  lotação), nunca a medida interna do compartimento. O baú é montado por um implementador depois do
  chassi, e o que ele mede por dentro não é campo de registro.
- **Herança por marca/modelo.** `VEHICLE_BRAND_DEFAULT_FIELDS` copia doze campos entre veículos da
  mesma marca, incluindo `capacityCubicMeters` e `capacityKilograms`, e **não** as dimensões. O
  arquivo já registrava o porquê: o catálogo FIPE devolve só marca e modelo.

O caminho mais barato para uma planta fiel é **perguntar as três medidas uma vez por caminhão**, a
quem cadastra a frota, com a fita na mão. Oito veículos, três números cada.

⚠️ **Achado vizinho, fora do escopo desta spec:** o CRLV imprime tara e capacidade em quilos, e o
parser não os extrai — `tareWeightKilograms` e `capacityKilograms` continuam digitados à mão. Peso
não desenha planta, então isso não entra aqui; mas é o mesmo tipo de campo que existe no documento e
ninguém lê, e foi essa família que originou esta spec.

## Decisões

- **D1 — Vista de cima, nunca 3D.** Comprimento e largura desenham a planta; a altura entra só como
  **quantas camadas cabem**, em texto. Perspectiva sem geometria de caixa é enfeite, e enfeite que
  parece plano de estiva é pior que nada. (Confirma a decisão tomada na 085.)
- **D2 — A escala sai da ficha; sem ficha, não há planta.** A ordem é **ficha → nada**. A referência
  de mercado continua servindo à **ocupação** (é piso de m³, e a 075 já a usa), mas **não** desenha
  planta: erro de 2× dentro do tipo vira erro de metro na tela de quem vai medir. Sem as três
  medidas, a tela mostra as fileiras proporcionais da 085 — que não prometem metro nenhum — e diz
  qual campo preencher.
- **D3 — A faixa de cada parada é proporcional ao volume, não à geometria da caixa.** Com 6 de 663
  medidas, empacotar caixa a caixa seria fabricar precisão. A divisão é ao longo do **comprimento**:
  o baú é longo e estreito (8,90 × 2,50), e é assim que um caminhão é carregado de verdade — faixa
  transversal, da parede do fundo até a porta.
- **D4 — A ordem é a inversa da entrega, e agora em metros.** A última parada encosta no fundo; a
  primeira fica na porta. O que muda em relação à 085 é a unidade: "sua carga ocupa 1,8 m de baú, a
  partir de 4,2 m da porta".
- **D5 — Onde a caixa está medida, o desenho conta camadas.** Área da faixa ÷ pegada da caixa dá
  caixas por camada; altura do baú ÷ altura da caixa dá as camadas. **Só quando toda caixa daquela
  parada está medida** — uma medida faltando torna a conta um palpite com cara de contagem, e aí a
  faixa mostra só a profundidade. É aqui que a fila de medição da 085 paga.
- **D6 — A lateral é uma borda de verdade.** Em `rear_and_side` e `open`, a faixa que toca a lateral
  é alcançável sem descarregar o que está na frente, e a planta marca essa borda. Em `rear`, a ordem
  é obrigação e a marca não existe — a mesma política `resolveCargoLayout` da 085.
- **D7 — Tipo sem referência não vira exceção silenciosa.** `three_quarter` e `body_type = '00'` não
  têm linha em `vehicle_volume_references`. Isso não muda com esta spec: quem preenche a ficha
  resolve o caso dele, e o tipo sem referência continua **nomeado** na tela, nunca escondido.

## Fora do escopo

- Plano de estiva caixa a caixa, e qualquer empacotamento (bin packing) — D3.
- Peso por eixo e distribuição de carga por eixo: é cálculo legal, com responsabilidade própria, e o
  alerta de concentração da 085 já cobre o que a tela precisa dizer hoje.
- Desenho em perspectiva ou 3D — D1.
- Preencher `vehicle_volume_references` para os tipos que faltam: é dado de mercado e precisa de
  fonte, como a ANP em `fuel_price_references`.

## Requisitos funcionais

### R1 — A ficha do veículo pede as três medidas do baú

O formulário da frota passa a pedir **comprimento, largura e altura** do compartimento de carga, ao
lado da capacidade. Os três campos são opcionais — nem toda frota vai medir de imediato —, e o
`Capacidade (m³)` deixa de ser digitado quando os três estão preenchidos: `resolveVehicleCapacity` já
prefere as dimensões, e manter dois números que discordam é a divergência que ninguém corrige.

⚠️ Preenchidos os três, a tela mostra o m³ **derivado** e diz de onde ele veio. O campo digitado
continua existindo para quem só sabe o m³.

### R2 — A planta do baú, em escala

Vista de cima, com proporção real entre comprimento e largura, e a régua em metros na borda. A porta
é uma borda desenhada, não uma legenda: é dela que o conferente se orienta.

### R3 — Cada entrega é uma faixa com profundidade em metros

Faixa transversal, da parede do fundo para a porta, na ordem inversa da entrega (D4). Cada faixa
carrega o rótulo da parada, a profundidade em metros e a distância da porta. A cor é a mesma paleta
das paradas do mapa da 085 — duas paletas para a mesma parada seriam duas verdades.

### R4 — Camadas, quando a medida existe

Faixa cuja parada tem **todas** as caixas medidas mostra "N caixas por camada, M camadas". Faltando
uma, a faixa mostra só a profundidade — e a tela diz quantas caixas daquela parada ainda faltam
medir, com atalho para a fila da 085.

### R5 — A lateral alcançável aparece na borda

Em veículo que abre pela lateral, a faixa que toca a borda lateral é marcada, e o texto diz que a
ordem ajuda mas não obriga — mesma política da 085 R5.

### R6 — Sem medida do baú, a tela não promete metro

Veículo sem as três dimensões mantém as fileiras proporcionais da 085, com um aviso que nomeia o
campo que falta e leva à ficha do veículo. Nunca uma planta desenhada com medida de referência.

## Casos extremos e falhas

- **Carga maior que o baú.** A soma das faixas passa do comprimento: o excesso sai como faixa
  hachurada **fora** da porta, com o metro que sobrou. Encolher tudo para caber esconderia o estouro,
  que é a informação.
- **Parada sem volume conhecido.** Não vira faixa de tamanho zero: ela é listada ao lado da planta,
  como as fileiras da 085 já fazem com `stopsWithoutVolume`.
- **Baú mais largo que comprido** (utilitário: 1,70 × 1,30). A planta continua correta; a divisão
  segue o comprimento por decisão, não por ser sempre o maior lado.
- **Uma parada só.** A faixa ocupa o baú inteiro e a ordem não é dita — não há ordem entre um.
- **Dimensão digitada errada por uma ordem de grandeza** (2,5 cm em vez de 2,5 m). O CHECK do banco
  precisa de piso e teto por dimensão, como o da caixa: baú de 40 m ou de 4 cm não existe.

## Critérios de aceite

1. Veículo com as três medidas preenchidas desenha a planta em escala, e a proporção na tela bate com
   a razão comprimento/largura da ficha.
2. Veículo sem as três medidas **não** desenha planta e nomeia o campo que falta.
3. A soma das profundidades das faixas é o comprimento do baú, menos o espaço livre.
4. A ordem das faixas, do fundo para a porta, é a inversa da ordem de entrega.
5. Parada com todas as caixas medidas mostra caixas por camada; com uma faltando, não mostra.
6. Carga maior que o baú desenha o excesso fora da porta, com o metro excedente.
7. `three_quarter` e `body_type = '00'` continuam sem referência, e isso aparece nomeado.

## Dúvidas

Nenhuma em aberto. As duas que existiam foram fechadas pela medição: a escala sai da ficha e não da
referência (D2), e o empacotamento fica fora do escopo enquanto a fila de medição não avançar (D3).
