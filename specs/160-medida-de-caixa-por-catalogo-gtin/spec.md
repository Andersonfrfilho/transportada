# Feature 160 — Medida de caixa por catálogo de GTIN

## Problema e resultado

Hoje toda dimensão de caixa nasce de alguém medindo: `nfe_package_boxes.length_mm/width_mm/height_mm`
nascem `null` e só o conferente preenche (`typed`, `camera`, `camera_adjusted`). A spec 155 mostrou a
escala do buraco — 643 caixas pendentes contra 12 medidas — e resolve a parte da duplicação por
variação, não a parte do trabalho braçal.

Uma fatia dessas caixas já carrega `carton_gtin` (~11% das linhas), preenchido na importação da NF-e
a partir de `cEAN`/`cEANTrib`. Para essas, existe catálogo público com a medida da caixa master. O
resultado desta feature é: **caixa com GTIN conhecido chega ao conferente já com uma medida proposta
e a origem visível, em vez de em branco** — e nenhuma medida humana existente é tocada.

O que mede o sucesso: proporção de caixas com GTIN que saem da fila sem medição manual, e zero
medidas absurdas promovidas para `nfe_package_boxes`.

## Fora do escopo

- Caixa sem `carton_gtin` — sem chave, não há consulta. Continua manual (ou replicada pela 155).
- Sobrescrever medida humana. Catálogo nunca vence gente.
- Plano pago de qualquer provedor. A feature vive dentro das cotas gratuitas.
- Cadastrar/corrigir dado no catálogo de terceiro (devolver correção ao Cosmos/GS1).

## Histórias priorizadas

### P1 — A caixa com GTIN chega medida

**Given** uma caixa em `nfe_package_boxes` com `carton_gtin` preenchido e dimensões nulas
**When** o cron diário de catálogo roda e ao menos um provedor devolve dimensões que passam na
sanidade
**Then** nasce uma linha em `nfe_package_box_measurements` com `source = 'catalog'`, `engine` = nome
do provedor e as dimensões em `proposed_*_mm`, e a caixa aparece na fila do conferente já com a
medida proposta e o rótulo da origem.

### P2 — Duas fontes que concordam valem como medida

**Given** dois provedores responderam para o mesmo GTIN
**When** as três arestas batem dentro da margem de tolerância e o peso bruto bate dentro da margem
**Then** a proposta é promovida para `nfe_package_boxes` com `measurement_source = 'catalog'` e
`measurement_margin_mm` igual à maior divergência observada, sem passar pelo conferente.

### P3 — O dado torto não entra

O defeito é sistemático, não pontual: medido em dois GTINs de fabricantes diferentes, os dois
vieram com milímetro gravado como centímetro e grama gravada como quilo.

**Given** o Cosmos devolve, para o GTIN 7896098909768, `474,0 cm × 240,0 cm × 247,0 cm` e peso bruto
`0,015 kg`
**When** a sanidade avalia a resposta
**Then** nada é gravado como medida: a resposta é registrada como rejeitada com o código do motivo
(`EDGE_TOO_LARGE`, `GROSS_WEIGHT_BELOW_CONTENT`), e a caixa permanece na fila manual.

### P4 — O conferente decide quando as fontes brigam

**Given** dois provedores responderam e divergem além da tolerância
**When** o conferente abre a caixa na fila
**Then** vê as duas propostas lado a lado com a origem de cada uma e escolhe uma ou mede do zero; a
escolha grava `typed` (é decisão humana), não `catalog`.

### P5 — A cota do dia não é estourada

**Given** o plano gratuito do Cosmos permite 25 consultas por dia e o do GS1 permite 30
**When** o cron processa a fila de GTINs pendentes
**Then** ele para ao atingir a cota de cada provedor no dia, retoma no dia seguinte de onde parou, e
**nunca** consulta duas vezes o mesmo GTIN no mesmo provedor — a resposta (inclusive "não encontrado"
e "rejeitada") fica em cache permanente.

## Requisitos funcionais

- RF01 — Porta `PackageBoxCatalogPort` com um gateway por provedor. Provedores da primeira entrega:
  **Cosmos** (`X-Cosmos-Token`, 25/dia), **GS1 Verified** (30/dia) e **Open Products Facts**
  (sem token, sem cota prática).
- RF02 — Provedor sem credencial configurada é desligado em silêncio no boot, não derruba o cron.
  Open Products Facts funciona sem credencial nenhuma.
- RF03 — Open Products Facts **não devolve dimensões** (medido: `packagings: []`); entra como fonte
  de conferência de peso e nome, e por si só nunca promove uma medida.
- RF04 — Toda resposta de provedor, aceita ou rejeitada, é persistida em `gtin_catalog_lookups`
  (cache permanente por `(provider, gtin)`) com o payload normalizado e o veredito da sanidade.
- RF05 — Sanidade obrigatória antes de qualquer gravação, com código estável por motivo:
  - `EDGE_TOO_LARGE` — aresta acima de 2500 mm.
  - `EDGE_TOO_SMALL` — aresta abaixo de 20 mm.
  - `GROSS_WEIGHT_BELOW_CONTENT` — peso bruto menor que `units_per_box` × peso unitário conhecido.
  - `DENSITY_OUT_OF_RANGE` — densidade fora da faixa esperada **para a categoria/NCM do produto**.
    Faixa única não serve: medido no GTIN `7898963886129` (batata palha), a caixa dá 486 kg/m³ e
    passaria por um intervalo genérico de 50–1200 kg/m³, embora seja fisicamente impossível —
    batata palha solta fica em 100–150 kg/m³. A faixa vem de uma tabela por NCM, e NCM sem faixa
    conhecida não promove por densidade (só rejeita nos outros códigos).
  - `VOLUME_BELOW_CONTENT` — o volume da caixa não comporta `units_per_box` × volume unitário
    estimado pela densidade da categoria.
  - `UNIT_AMBIGUOUS` — o conjunto só fecha se reinterpretado noutra unidade (mm lido como cm).
- RF06 — Reinterpretação de unidade é **rejeição**, nunca correção automática. O registro guarda a
  hipótese (`"cabe se mm"`) para o conferente, e a decisão é dele.
- RF07 — Promoção automática exige **duas fontes com dimensão** concordando dentro da tolerância
  (RNF03). Uma fonte só vira proposta na fila.
- RF08 — Nenhuma linha de `nfe_package_boxes` com dimensão já preenchida é alterada, qualquer que
  seja a origem da dimensão existente.
- RF09 — O enum `PACKAGE_BOX_MEASUREMENT_SOURCES` ganha `'catalog'`, convivendo com o `'replicated'`
  que a spec 155 introduz.
- RF10 — A UI da fila mostra a origem da medida proposta (nome do provedor e data da consulta) e
  permite ao conferente aceitar, corrigir ou descartar.

## Requisitos não funcionais

- RNF01 — Catálogo de GTIN é dado público e **global**, não de tenant: `gtin_catalog_lookups` não
  tem `company_id`. A ligação com a empresa acontece só em `nfe_package_boxes`, que segue com
  `company_id` do contexto autenticado. Nenhuma consulta cruza dado de empresa.
- RNF02 — Token de provedor só existe como variável de ambiente validada por schema no boot; nunca
  em log, payload ou resposta de erro.
- RNF03 — Tolerância de concordância entre fontes: 15 mm por aresta e 5% no peso bruto.
- RNF04 — Cada chamada externa tem timeout de 10 s e no máximo 2 tentativas com backoff; falha de
  rede não consome cota contabilizada.
- RNF05 — Dinheiro não entra aqui; dimensões são inteiros em milímetro e peso inteiro em grama,
  como já é hoje no schema.

## Casos extremos e falhas

- GTIN com 13 dígitos (unidade) em vez de 14 (caixa master): a consulta é pela chave que está em
  `carton_gtin`; se o provedor devolver dado da unidade e não da caixa, `units_per_box` não fecha e
  a resposta é rejeitada por `GROSS_WEIGHT_BELOW_CONTENT`.
- Provedor devolve 200 com HTML em vez de JSON (medido em `api-produtos.seunegocionanuvem.com.br`):
  parsing falha, resposta é registrada como inválida e o provedor entra em circuito aberto pelo resto
  do dia.
- Provedor devolve 401 por token vencido: o provedor é desligado no dia e o fato é logado uma vez,
  sem repetir por GTIN.
- Caixa medida pelo conferente entre a consulta e a promoção: a promoção verifica dimensão nula no
  momento do `UPDATE` (condicional), e desiste sem erro.
- Mesmo GTIN em duas empresas: uma consulta só, cache global, duas caixas beneficiadas.

## Critérios de aceite

- CA01 — Contrato: o payload real do Cosmos para `7896098909768` (474/240/247 cm, 0,015 kg) é
  rejeitado por `EDGE_TOO_LARGE` e `GROSS_WEIGHT_BELOW_CONTENT`, e nenhuma dimensão é gravada.
- CA01b — Contrato: o payload real do Cosmos para `7898963886129` (caixa `17898963886126`, 20 un.,
  365/220/256 cm, 0,010 kg) é rejeitado por `EDGE_TOO_LARGE` e `GROSS_WEIGHT_BELOW_CONTENT`; e,
  **mesmo reinterpretado em milímetro** (36,5 × 22,0 × 25,6 cm = 20,6 L para 10 kg de batata
  palha), continua rejeitado por `VOLUME_BELOW_CONTENT`. Uma faixa de densidade única deixaria
  esse caso passar — este é o teste que prova a necessidade da faixa por NCM.
- CA02 — Contrato: duas fontes dentro da tolerância promovem a medida com `source = 'catalog'`.
- CA03 — Contrato: fonte única gera proposta e **não** promove.
- CA04 — Contrato: caixa com dimensão já preenchida não é alterada em nenhum caminho.
- CA05 — Contrato: o mesmo GTIN consultado duas vezes no mesmo provedor faz **uma** chamada externa.
- CA06 — Contrato: atingida a cota do provedor, o cron para sem erro e retoma no dia seguinte.
- CA07 — Integração: o cron completo roda contra gateways falsos e deixa fila e caixas no estado
  esperado.
- CA08 — Revisão de design e usabilidade da fila com a origem da medida, fechada com print.

## Dúvidas

Nenhuma bloqueante. As credenciais de Cosmos e GS1 dependem de cadastro do usuário e a feature
entrega com o provedor desligado até chegarem (RF02).
