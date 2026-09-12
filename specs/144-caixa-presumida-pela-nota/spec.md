# Spec 144 — A caixa presumida sai do resíduo da nota, e a tela diz o que falta medir

> 🤖 Modelo: `opus` 🧠 (aritmética do resíduo e precedência da caixa presumida) · `sonnet` (infra,
> layout, tela, docs)

## Problema

O empacotador só desenha caixa com medida. Enquanto a transportadora não mediu tudo — e no começo ela
não mediu nada —, a caixa que não tem ficha ganha a **mediana das caixas medidas da empresa**
(`medianBoxVolumeM3`, spec 085 G006), e sem mediana nenhuma cai em `unplaced` como `notMeasured`.

Três consequências, todas vistas na investigação que gerou `da30f9a0` (caixa da parada sem cubagem
sumia do desenho) e `1ca4b17a` (viagem salva sem `securesCargo`):

1. **O desenho não fecha com a fatia.** A fatia da parada é dimensionada pelo volume da nota
   (`qVol × fator da espécie`, spec 075); as caixas dentro dela são a mediana da empresa. Com nota de
   10 volumes a 0,050 m³ (0,500 m³ de fatia) e mediana de 0,036 m³, o desenho soma 0,360 m³ — a faixa
   sobra 28% e o conferente lê espaço que não existe. Com mediana de 0,080 m³ o desenho soma 0,800 m³
   e transborda uma faixa que na verdade cabe.
2. **Nota meio medida ignora o próprio total.** `resolveMeasuredCargoVolume` soma `caixa medida × qCom`
   e, para a linha sem medida, `mediana × qCom`. O total da nota — o único número de tamanho que a
   NF-e traz — não entra na conta em momento nenhum.
3. **Ninguém sabe o que falta medir.** A tela da viagem mostra só "N notas sem cubagem"
   (`occupancy.withoutVolume`) e a linha "N caixas de X ficaram fora do desenho". Não há lista de
   produto, código e nota para o conferente levar à fila de medição da spec 085.

## Decisão

- **D1 — Precedência da caixa.** Cada caixa do plano recebe volume nesta ordem, e para na primeira
  que responde:
  1. a **medida do conferente** (`nfe_package_boxes`, as três dimensões);
  2. o **resíduo da nota** dividido pelas caixas que ainda não têm medida (D2);
  3. a **mediana das caixas medidas da empresa** (regra atual, mantida como terceiro degrau);
  4. `notMeasured` em `unplaced`, nomeada — nunca some.
- **D2 — Aritmética do resíduo.** Por nota:
  - `total` = `qVol × fator da espécie` (`resolveCargoVolume`). É o total que a NF-e dá; não existe m³
    declarado no `<vol>`.
  - `medido` = Σ `caixa medida × ceil(qCom / unitsPerBox)` das linhas com ficha.
  - `restantes` = Σ `ceil(qCom / (unitsPerBox ?? 1))` das linhas **sem** ficha — a mesma contagem que
    `countMeasuredBoxes` já faz. Evidência para não inventar outro divisor:
    `qVol = Σ qCom` em 100% das 345 notas medidas (`docs/ai-context/api-transportada.md`, fila da
    085), então `restantes = qVol − caixas medidas` na prática, e quando uma nota divergir o que se
    conserva é o **m³**, não a contagem.
  - `resíduo` = `total − medido`. Se `resíduo > 0` e `restantes > 0`: cada caixa sem ficha vale
    `resíduo ÷ restantes`, e o volume da nota é `total`. Se `total` não existe (sem `<vol>` ou sem
    fator para a espécie) **ou** `resíduo ≤ 0` (o medido já passou do total da nota): degrau 3 da D1,
    e o volume da nota é `medido + mediana × restantes`, como hoje.
  - Exemplo: nota com `qVol = 10`, fator 0,050 → `total` 0,500 m³. Produto A medido, 4 caixas de
    0,040 → `medido` 0,160. Produto B sem ficha, `qCom = 6` → `restantes` 6. `resíduo` 0,340 →
    6 caixas de **0,0567 m³**. Fatia 0,500, desenho 0,160 + 0,340 = 0,500. Hoje: 0,160 + 6 × 0,036 =
    0,376 no desenho, e a fatia igual — a nota meio medida hoje **não** usa 0,500 em lugar nenhum.
- **D3 — Origem.** Caixa dos degraus 2 e 3 sai `source: 'estimated'` (hachurada) e o plano fica
  `estimated` enquanto houver uma (ADR-0044 §1: número plausível sem aviso é o defeito). A nota com
  linha sem ficha continua `partial`, nota sem ficha nenhuma continua `estimated`; **a pior origem
  segue mandando** no total da viagem (075/085). A forma da caixa presumida vem de `resolveFallbackBox`
  com o volume do degrau — mediana das formas medidas ou `CATALOGUE_RATIO` 0,40 × 0,30 × 0,25, escalada
  pela raiz cúbica — como hoje.
- **D4 — Lista do que falta medir.** `ResolvedCargoLayout` ganha `pendingMeasurements`: uma linha por
  produto sem ficha na viagem, com `productCode`, `label` (descrição), `documentNumber`, `stopLabel`,
  `sequence`, `boxCount` e `estimateSource: 'note' | 'median' | 'none'`. Ordenada por `boxCount`
  decrescente — a mesma ordem da fila da 085, "quem mais vale medir primeiro". Vai na resposta do
  detalhe da viagem (`TripCargoLayoutView`) e da prévia (`POST` cargo preview), e a tela lista em
  `TripCargoPanel`, com atalho para a fila de medição (`/nfe-package-boxes`). Lista vazia = nada a medir;
  a tela então não mostra a seção.
- **D5 — Conservação continua a lei.** `caixas desenhadas + caixas em unplaced com motivo = caixas de
entrada`, para toda parada, com ou sem cubagem, com ou sem ficha
  (`cargo-layout-conservation.contract.ts`). Soma-se um segundo invariante: numa parada em que toda
  caixa é medida ou presumida pela nota, `Σ m³ das caixas desenhadas + unplaced` fecha com o
  `volumeM3` da fatia, com tolerância do arredondamento a milímetro.
- **D6 — O que não muda.** Apoio de 80%, escora pelo lado, célula de 5 cm, `STABLE_STACK_SLENDERNESS`,
  `DEFAULT_ROW_COUNT`, o teto de peso e o balanceamento por `payloadRatio`. O empacotador não ganha
  peso por caixa (fora do escopo abaixo). A medida do conferente **sempre** vence: quando toda linha
  da nota tem ficha, D2 nem é consultada.

## Fora do escopo

- Peso por caixa no empacotador (`PlacementBox` sem massa) — spec própria.
- m³ declarado na NF-e: não existe no `<vol>`; se algum emissor mandar `infAdic`, é outra spec.
- A fila de medição da 085 e o formulário de ficha não mudam; a lista da D4 só aponta para eles.
- Busca, orientação e desempenho do empacotador — spec 143.

## Critério de aceite

- **G001** Contrato do resíduo (`test/cargo-volume/document-box-estimate.contract.ts`), vermelho antes
  do código: nota sem ficha → `qVol` caixas de `total ÷ qVol`; nota meio medida → exemplo da D2 com
  0,0567; `resíduo ≤ 0` → mediana; sem total e sem mediana → `null`; toda linha com ficha → D2 não
  altera nada.
- **G002** `cargo-layout-conservation.contract.ts` estendido: parada cuja nota não tem ficha nenhuma
  e tem `qVol` desenha `qVol` caixas `estimated`, `unplaced` vazio, e o m³ desenhado fecha com a fatia
  (D5). O caso "sem medida e sem reserva → `notMeasured`" continua verde.
- **G003** `toPlacementBoxes` respeita a D1: caixa com `estimatedVolumeM3` não usa a mediana; caixa
  sem ele usa; caixa medida ignora os dois.
- **G004** `pendingMeasurements` sai na prévia e no detalhe da viagem, com os campos da D4, ordenada;
  viagem toda medida devolve `[]`. Coberto em `cargo-layout.contract.ts` e no contrato da prévia.
- **G005** Tela: `TripCargoPanel` lista produto, código, nota e caixas pendentes; some quando a lista é
  vazia; texto em pt e en; validação da resposta aceita a chave ausente (API antiga).
- **G006** As quatro viagens reais e o Atego da fixture antiga (contratos de placement existentes) sem
  piora de caixas colocadas — a caixa presumida troca de tamanho, não de regra física.
- **G007** `bun test ./test/cargo-volume.contract.test.ts`, `bun run typecheck`, `make check` verdes.
  A falha de 50 ms do Atego de 1417 caixas é pré-existente em `staging` (~235 ms) e não conta contra
  esta spec; registrar em `evidence.md` se seguir vermelha.
- **G008** `docs/ai-context/api-transportada.md` (parágrafo "duas origens novas", ~linha 555) e
  `apps/api-transportada/CLAUDE.md` refletem a precedência da D1 (regra 14).
