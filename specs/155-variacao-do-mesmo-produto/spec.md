# Spec 155 — A variação do mesmo produto mede uma vez e replica

> 🤖 Modelo: `opus` 🧠 (a regra de família e o que ela pode replicar) · `sonnet` (API, tela) ·
> `haiku` (locales, docs)

## Problema

A fila de medição de caixas de produção tem **643 caixas pendentes contra 12 medidas**. O conferente
mede a mesma caixa física muitas vezes porque cada sabor do produto é uma linha própria: a identidade
de `nfe_package_boxes` é `(empresa, emitente, cProd, uCom)`, e o emitente dá um `cProd` por sabor.

Medido em produção em 2026-09-17 (655 linhas, um emitente):

| medida                        | valor                          |
| ----------------------------- | ------------------------------ |
| caixas cadastradas            | 655                            |
| medidas / pendentes           | 12 / 643                       |
| famílias de variação (D2)     | 374                            |
| famílias com 2+ variações     | 122                            |
| caixas dentro dessas famílias | 403 (61%)                      |
| maior família                 | 14 (`REFR TANG 18G` · `CX180`) |
| medições poupadas ao replicar | **276 das 643 (43%)**          |

O caso que o operador trouxe mostra os dois eixos de uma vez — `SAB FARNESE 180G`, **8 linhas para
2 caixas físicas**:

```
6958  CX36 / FR12   SAB FARNESE 180G PURO E HIDRATAN
6959  CX36 / FR12   SAB FARNESE 180G AVEIA ESFOLIANT
6960  CX36 / FR12   SAB FARNESE 180G LAVANDA E MENTA
6961  CX36 / FR12   SAB FARNESE 180G ERVA DOCE HORTE
        ↑ eixo 2: embalagem    ↑ eixo 1: sabor
```

Dois problemas distintos, hoje confundidos num só:

1. **Sabor.** Quatro linhas `CX36` que são a mesma caixa de papelão. Medir uma deveria bastar.
2. **Embalagem.** Cada sabor aparece em `CX36` e `FR12` com a descrição **idêntica** na tela — só a
   unidade muda, e a unidade não tem destaque. Parece linha duplicada, e foi reportado como
   duplicação em produção.

⚠️ **Não há duplicata no banco.** A busca por pares reais (normalizando caixa e pontuação da unidade)
devolve **zero**; a constraint `nfe_package_boxes_identity_unique` está íntegra nas 655 linhas.
`CX36` e `FR12` do mesmo sabão são duas caixas de verdade e as duas precisam de medida — apagar uma
quebra o desenho da carga.

⚠️ **A importação nunca apagou medida, e não pode passar a apagar.** Os três caminhos de escrita já
preservam: `writePackageBoxes` (`drizzle-nfe-import-consumer.repository.ts:525`) faz
`onConflictDoUpdate` só de `carton_gtin` e só onde é nulo; `insertPackageBoxes`
(`drizzle-nfe-package-box-backfill.repository.ts:59`) faz `onConflictDoNothing`; `fillCartonGtin`
(`drizzle-nfe-package-box-gtin-backfill.repository.ts:123`) filtra `carton_gtin is null`. Conferido
no dado: 12 medições no histórico, 12 vigentes, **0 caixas com histórico e medida ausente**. Esta
spec não relaxa nenhuma dessas três garantias — e acrescenta a sua (D4).

## Decisões

### D1 — Duas relações, propósitos diferentes

| relação                 | chave                       | o que é                                | replica medida? |
| ----------------------- | --------------------------- | -------------------------------------- | --------------- |
| **Família de variação** | `(emitente, prefixo, uCom)` | mesma caixa física, sabores diferentes | **sim**         |
| **Grupo de embalagem**  | `(emitente, cProd)`         | mesmo produto, embalagens diferentes   | **não**         |

Separar as duas é o núcleo da spec. Tratá-las como uma só é o que produz medida errada.

### D2 — A chave da família é a descrição até o último número

`prefixo` = a descrição até o **último token que contém dígito**, normalizada (trim, espaços
colapsados, maiúscula). O resto é o **rótulo da variação**. Regex: `^.*[0-9][^ ]*` (guloso).

```
REFR TANG 18G MANGA            → prefixo "REFR TANG 18G"        rótulo "MANGA"
AMAC CONC DOWNY 500ML BRISA SUAVE → "AMAC CONC DOWNY 500ML"      "BRISA SUAVE"
ABS INTIMUS NOTURNO C/16 SUAVE C/ABAS → "ABS INTIMUS NOTURNO C/16" "SUAVE C/ABAS"
SAB FARNESE 180G ERVA DOCE HORTE  → "SAB FARNESE 180G"           "ERVA DOCE HORTE"
AMIDO MILHO MAIZENA 200G       → "AMIDO MILHO MAIZENA 200G"      (sem rótulo, família de 1)
```

O `uCom` entra na chave porque `CX180` e `DP18` do mesmo Tang são caixas diferentes.

Por que o corte no **último** dígito e não no primeiro: os dois erram, mas erram para lados
diferentes. O guloso deixa `CR TRAT SKALA 1KG 12 EM 1` órfão dos outros cinco cremes da linha — custa
uma medição manual. O corte no primeiro dígito juntaria `REFR TANG 18G PACK 15` com o sachê avulso —
custa uma medida errada gravada. Errar para menos é reversível; errar para mais não é.

⚠️ **O prefixo sozinho não garante marca única.** `AZEITE 500ML` é categoria + volume, com a marca na
cauda (`PET EXT VIRG COCINERO` e `VD TRAD ANDORINHA`): ele agruparia garrafa PET com garrafa de vidro,
de fabricantes diferentes. Daí o piso: **prefixo com menos de três tokens não abre família**
(`MINIMUM_FAMILY_PREFIX_TOKENS = 3`). Medido sobre as caixas de produção, esse piso derruba
exatamente uma família — a falsa — e nenhuma verdadeira.

Rodada nas 655 linhas de produção, a regra com o piso produz **121 famílias com dois ou mais membros,
cobrindo 401 caixas**.

### D3 — O grupo de embalagem agrupa na tela e **nunca** replica dimensão

Chave `(emitente, cProd)`: 91 códigos, 182 linhas em produção.

⚠️ **Medido: dos 91 códigos, 0 têm a mesma contagem por embalagem — todos os 91 diferem.** `CX180` vs
`DP18`, `CX36` vs `FR12`, `CX48` vs `PC6`. A contagem está no sufixo numérico da unidade, e contagem
diferente é caixa de tamanho diferente. Replicar dimensão aqui escreveria medida errada em **100%**
dos casos.

O que o grupo faz, então: junta as linhas na tela sob o produto e **mostra a unidade com destaque**,
com a contagem por extenso (`CX36 · 36 un`, `FR12 · 12 un`). A duplicação aparente some sem apagar
linha nenhuma, e fica explícito que são duas medições a fazer.

### D4 — Replicar só escreve em caixa **sem** medida

Alvo com `measured_at is not null` é recusado pela rota, não sobrescrito. Consequências:

- a restrição do operador ("não podemos remover as medidas que já cadastramos") passa a valer também
  para a operação nova, e não só para a importação;
- replicar duas vezes dá o mesmo resultado — a segunda vez não tem alvo;
- para trocar uma medida errada, remede aquela caixa individualmente, pelo caminho que já existe.

### D5 — Replicar é confirmado, nunca automático

A regra da família é heurística de texto. O conferente vê a lista de alvos, cada um com o rótulo da
variação, todos pré-marcados, e desmarca o que não servir. Nada é gravado sem o clique.

### D6 — O que a replicação copia, e a proveniência que ela deixa

Copia `length_mm`, `width_mm`, `height_mm`, `gross_weight_grams` e `units_per_box` da caixa de
origem. Grava no alvo `measurement_source = 'replicated'` e `measurement_margin_mm = null`.

Medida replicada **não é medida conferida**, e o cadastro tem de saber a diferença — para a auditoria,
para um futuro filtro "conferir replicadas", e para não inflar a contagem de caixas realmente
medidas. O histórico `nfe_package_box_measurements` ganha `replicated_from_box_id` (nullable),
apontando para a origem pela FK composta `(company_id, package_box_id)` que já existe.

### D7 — O botão rápido preenche, não grava

Caixa pendente cuja família já tem irmã medida ganha na linha **“usar a medida de {rótulo}”**. O
clique preenche os campos do formulário; o conferente confere contra a caixa na mão e salva pelo
botão de sempre. É um atalho de digitação, não uma segunda via de gravação.

### D8 — A unidade comercial ganha destaque na linha

Badge com a unidade e a contagem ao lado da descrição, em toda linha da fila — não só nas agrupadas.
É a correção direta do que foi reportado como duplicação.

### D9 — O tamanho da família é contado fora da janela da fila

A listagem é `limit 50` (default) ordenada por volume transportado, sem paginação. O contador de
irmãos tem de sair de uma window function sobre **todas** as caixas da empresa, antes do `LIMIT`,
senão ele mente para toda família que atravessa a borda da página. Os irmãos em si vêm por rota
própria, sob demanda.

### D10 — Fora de escopo, e vira spec própria: o `carton_gtin` não é o GTIN da caixa

Achado enquanto se investigava o código `05868574001090` que o operador tentou bipar. Ele não é
código de produto nenhum: é o **CNPJ do emitente** (`nfe_package_boxes.emitter_tax_id`) das 663
caixas — por isso a busca por `carton_gtin`, `cProd` e `nfe_products` não devolveu nada.

Medido: **650 das 655 linhas (99,2%) têm `carton_gtin`** — muito acima dos 11% que o comentário do
schema registra. E o mesmo valor aparece em unidades comerciais diferentes:

```
4005900521972  CX96 + FR12   SAB NIVEA 85G LAVANDA
7622210571519  CX180 + DP18  REFR TANG 18G MANGA
7897751900184  CX36 + FR12   SAB FARNESE 180G ERVA DOCE HORTE
```

Duas embalagens distintas não compartilham GTIN real. O que está gravado é o **GTIN da unidade de
consumo** (o `cEAN` que o emitente preenche igual em toda linha do produto), não o da caixa. Por isso
bipar o ITF-14 impresso no papelão não casa com nada, e o filtro `scanned` volta vazio.

Isto não bloqueia esta spec — o agrupamento não usa GTIN. Mas invalida a premissa do bipe da spec 151
e precisa de spec própria. **Não corrigir aqui.**

### D11 — A família com formato assimétrico nasce marcada, e o rótulo nunca decide sozinho

Duas famílias de produção passam pelo piso da D2 e ainda assim misturam embalagens: uma **palavra de
formato** (`VACUO`, `TUBO`, `SACHE`, `PCT`, `REFIL`, `VD`, `PET`, `LATA`, `POTE`…) aparece em alguns
rótulos da família e não em todos.

```
CAFE MELITTA 500G|CX20     EXTRA FORTE TRA · VACUO TRADICION
BATATA PRINGLES 109G|CX18  CHURRASCO · CREME E CEBOLA · TUBO QUEIJO
```

O café a vácuo é tijolo, o tradicional é almofada. São **exatamente essas duas** em 121 famílias — o
predicado não marca nenhuma das quatro simétricas (`CAFE CABOCLO 500G`, `LAVA ROUPA PO TIXAN
800G|FD20`, `LEITE PO ITAMBE 400G`, `MOLHO QUERO 240G`), onde a palavra de formato ou está em todos os
rótulos ou em nenhum.

Recusado o critério alternativo de "grau de tamanho" (`PP|P|M|G|GG|XG|XXG|RN`): marcaria 7 das 121 por
engano, porque `M FRAMBOESA`, `F FRESH`, `B AMENDOAS` e `A M XTRA COOL` são iniciais de abreviação,
não tamanhos.

A família marcada **não deixa de existir** — replicar continua permitido. O que muda é que ela chega
ao conferente sem pré-marcação: a tela desmarca os alvos por padrão e diz por quê. Errar para menos
custa cliques; errar para mais grava medida errada.

⚠️ **Corolário, e vale para toda a Fase 3:** o rótulo da variação **não** é identificação suficiente
na hora de confirmar. Dos rótulos das famílias com dois ou mais membros, 16 têm três caracteres ou
menos, e há pares onde um é prefixo do outro (`UVA` ⊂ `UVA INTENSA`, `LAKA` ⊂ `LAKA OREO`). Toda tela
que peça confirmação para escrever mostra **descrição completa + `cProd`**, nunca só o rótulo.

## Requisitos

- **G001** — `resolveBoxFamily(description, commercialUnit)` devolve `{ prefix, variantLabel }` pela
  D2; descrição sem dígito devolve a descrição inteira como prefixo e rótulo vazio.
- **G002** — Item da listagem carrega `familyId`, `variantLabel`, `familyPendingCount`,
  `familyMeasuredCount`, `packagingGroupId`, `packagingUnitCount`, contados sobre toda a empresa (D9).
- **G003** — `GET /nfe-package-boxes/:id/siblings` devolve as irmãs da família e as do grupo de
  embalagem, em listas separadas e rotuladas, cada uma com estado de medida.
- **G004** — `POST /nfe-package-boxes/:id/replicate` copia os campos da D6 para os `targetIds`
  informados, numa transação, e devolve quantas gravou.
- **G005** — A rota recusa (`409`) alvo já medido (D4), alvo de outra empresa (`404`), alvo fora da
  família da origem (`422`) e origem sem medida (`422`).
- **G006** — Toda gravação da G004 escreve uma linha em `nfe_package_box_measurements` com
  `source = 'replicated'` e `replicated_from_box_id` preenchido.
- **G007** — A importação e os dois backfills continuam sem tocar em dimensão, `measured_at`,
  `units_per_box` e `measurement_source` de linha existente — contrato de regressão explícito.
- **G008** — A fila mostra a unidade comercial com a contagem em toda linha (D8) e agrupa as linhas
  do mesmo `packagingGroupId`.
- **G009** — Linha pendente com irmã medida mostra “usar a medida de {rótulo}”, que preenche o
  formulário sem gravar (D7).
- **G010** — Depois de salvar uma medida, havendo irmã pendente na família, a tela oferece replicar
  com a lista pré-marcada (D5).
- **G011** — Família de formato assimétrico (D11) chega ao diálogo de replicar **sem** pré-marcação,
  com o motivo visível; a lista de alvos mostra descrição completa e `cProd` de cada caixa.

## Critério de aceite

1. `SAB FARNESE 180G` em `CX36`: medir `PURO E HIDRATAN` e replicar cobre os outros três sabores; as
   quatro linhas `FR12` continuam pendentes e **não** recebem dimensão.
2. `REFR TANG 18G` · `CX180`: uma medição oferece 13 alvos; desmarcar 3 grava 10.
3. Replicar de novo na mesma família não grava nada e não erra (D4).
4. Caixa medida antes da spec não muda de `measurement_source` nem perde medida.
5. Reimportar NF-e dos produtos medidos não altera dimensão nenhuma (G007).
6. Família que atravessa a borda dos 50 primeiros mostra o contador certo (D9).
7. `05868574001090` continua sem resultado no bipe — é o CNPJ do emitente, não um código de
   produto, e o que o bipe não acha é a D10. Nenhum dos dois é regressão desta spec.

## Fora de escopo

- Corrigir a origem do `carton_gtin` (D10) — spec própria.
- Peso e campos de empilhamento no formulário: hoje não existe input de peso no frontend, e
  `is_stackable` / `max_stack_count` / `is_fragile` / `keep_upright` não são graváveis por tela
  nenhuma. Esta spec replica o peso que já estiver na linha e não abre campo novo.
- Paginação da fila.
- Deduplicar linha de `nfe_package_boxes`: não há duplicata, e apagar quebra o desenho.
