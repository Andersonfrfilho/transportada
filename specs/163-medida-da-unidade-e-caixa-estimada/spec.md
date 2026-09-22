# Feature 163 — Medida da unidade (opcional) e caixa estimada

## Problema e resultado

A caixa master é o dado mais difícil de achar: das 613 capturas do Cosmos, 497 não têm medida
nenhuma, e a busca aberta quase nunca traz a caixa. Já a **unidade** (o produto na prateleira) tem
medida em qualquer farmácia, atacado ou marketplace — ex.: Lux Botanicals 85 g = 6 × 9 × 3 cm, 85 g.

Resultado: **a medida da unidade vira um dado opcional da caixa.** Com ela e `units_per_box`, o
sistema calcula uma **caixa estimada** (dimensões, volume e peso) que alimenta a cubagem enquanto não
existe medida real — sempre rotulada como estimada, nunca confundida com medida.

| Temos        | O que acontece                                                          |
| ------------ | ----------------------------------------------------------------------- |
| só a caixa   | igual hoje (specs 160/162)                                              |
| só a unidade | caixa **estimada** para cubagem + na fila do conferente como "estimada" |
| as duas      | a unidade confere a caixa (sanidade de volume/peso fica mais forte)     |
| nenhuma      | fila manual, igual hoje                                                 |

## Fora do escopo

- Tratar estimativa como medida: `length_mm/width_mm/height_mm` continuam `null` até medida real.
- Coleta automática de sites (spec 161 vale como está).
- Paletização (lastro/camada).

## Histórias

### P1 — Registrar a medida da unidade

**Given** uma caixa pendente
**When** a unidade é informada (conferente na fila, importação JSONL da 162, ou userscript com Alt+U)
**Then** grava `unit_length_mm`, `unit_width_mm`, `unit_height_mm`, `unit_gross_weight_grams` e
`unit_measurement_source` (`typed` | `catalog` | `manual:<domínio>`), sem mexer na medida da caixa.

### P2 — Caixa estimada a partir da unidade

**Given** unidade com as 3 arestas e `units_per_box > 1`, caixa sem medida real
**When** a estimativa roda
**Then** grava `estimated_*_mm`, `estimated_volume_cm3`, `estimated_gross_weight_grams` e
`estimated_arrangement` (ex.: `2x2x6`), escolhendo o arranjo inteiro `a×b×c = units_per_box` de
menor área de superfície, com folga de papelão de 4 mm por face e 5% de peso de embalagem.
Exemplo de aceite (Lux, 24 un. de 60×90×30 mm): `188×188×128 mm`, `2x2x6`, ~4 520 cm³, ~2 142 g.

### P3 — Cubagem usa a estimativa só na falta de medida

**Given** uma caixa com estimativa e sem medida real
**When** a cubagem/planejamento de carga lê a caixa
**Then** usa a estimativa e marca o resultado como "contém caixa estimada"; ao chegar medida real,
a estimativa deixa de ser usada (não é apagada).

### P4 — A unidade confere a caixa

**Given** caixa com medida (catálogo ou humana) e unidade informada
**When** a sanidade roda
**Then** volume da caixa < `units_per_box × volume da unidade` → rejeição `VOLUME_BELOW_CONTENT`;
peso bruto < `units_per_box × peso da unidade` → `GROSS_WEIGHT_BELOW_CONTENT` (reusa os códigos da 160).

### P5 — Fila mostra a origem

**Given** caixa só com estimativa
**Then** a fila do conferente mostra "Estimada pela unidade (2×2×6)" com as medidas e um botão para
**medir** ou **confirmar** — confirmar grava como `typed` (decisão humana), não como estimada.

## Requisitos funcionais

- RF01 — Migration aditiva em `nfe_package_boxes`: colunas nulas `unit_length_mm`, `unit_width_mm`,
  `unit_height_mm`, `unit_gross_weight_grams`, `unit_measurement_source varchar(32)`,
  `estimated_length_mm`, `estimated_width_mm`, `estimated_height_mm`, `estimated_volume_cm3`,
  `estimated_gross_weight_grams`, `estimated_arrangement varchar(16)`, `estimated_at`. CHECKs de faixa
  (aresta de unidade 5–1500 mm; estimada 20–2500 mm). Sem ENUM.
- RF02 — Política pura `package-box-estimate.policy.ts`: `estimatePackageBoxFromUnit({ unit, unitsPerBox })`
  → `{ lengthMm, widthMm, heightMm, volumeCm3, grossWeightGrams, arrangement } | undefined`
  (undefined se `unitsPerBox <= 1` ou unidade incompleta). Determinística; empate de área → menor maior aresta.
- RF03 — Sanidade da unidade antes de gravar (aresta 5–1500 mm, peso > 0); unidade trocada (ex. "216 cm"
  num frasco) é rejeitada com `UNIT_EDGE_OUT_OF_RANGE`, nunca corrigida.
- RF04 — Estimativa recalculada quando muda a unidade ou `units_per_box`; nunca quando já há medida real.
- RF05 — Importação (spec 162) aceita opcionalmente a linha "Unidade" da tabela do Cosmos e o campo
  `unitEdges` em `found_manual`; linha só com unidade é válida (não é mais `ignored_status`).
- RF06 — Userscript: **Alt+U** captura a seleção como medida da **unidade** do produto em espera
  (mesmo fluxo do Alt+C, com `kind: 'unit'`); servidor local grava `found_unit_manual`.
- RF07 — Leitura da cubagem: função única `resolveBoxDimensionsForCubage(box)` → `{ dims, isEstimated }`
  (medida real primeiro; senão estimada; senão `undefined`). Pontos de consumo atuais passam por ela.
- RF08 — API da fila e do detalhe da caixa expõem `unit`, `estimate` e `isEstimated`.
- RF09 — UI da fila: selo "Estimada", medidas estimadas, arranjo, ações medir/confirmar (P5).

## Requisitos não funcionais

- RNF01 — `company_id` do contexto em toda leitura/escrita; teste negativo entre empresas.
- RNF02 — Estimativa nunca preenche `length_mm/width_mm/height_mm` nem `measurement_source`.
- RNF03 — Inteiros em mm e g; volume em cm³ inteiro.

## Critérios de aceite

- CA01 — Contrato: Lux (60×90×30 mm, 24 un., 85 g) → `188×188×128`, `2x2x6`, 4 524 cm³ ±1%, 2 142 g ±1%.
- CA02 — Contrato: `units_per_box = 1` ou unidade incompleta → sem estimativa.
- CA03 — Contrato: unidade "2160 mm" num frasco → `UNIT_EDGE_OUT_OF_RANGE`, nada gravado.
- CA04 — Contrato: caixa medida com volume menor que o conteúdo pela unidade → `VOLUME_BELOW_CONTENT`.
- CA05 — Integração: estimativa não altera `length_mm`; chegada de medida real faz a cubagem ignorar a estimativa.
- CA06 — Integração: isolamento entre empresas.
- CA07 — `make migration-test` verde.
- CA08 — Revisão de design da fila com o selo "Estimada", fechada com print.

## Dúvidas

Nenhuma bloqueante. Depende da spec 162 para a parte de importação (RF05); as demais fases independem.
