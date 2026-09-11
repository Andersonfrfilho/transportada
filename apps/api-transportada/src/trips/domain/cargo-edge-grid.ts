/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * **O mapa de alturas com as bordas reais das caixas** (spec 132).
 *
 * O empacotador decide `x` e `y` por varredura e lê `z` de um relevo do piso. Até a spec 132 o relevo
 * era uma grade fixa de 5 cm, e a caixa ocupava células inteiras: a presumida de 0,261 m reservava
 * 0,30 m, e no Atego entravam 8 na largura de 2,47 m em vez de 9 — medido nas quatro viagens reais,
 * 23,7% de piso reservado além da medida de cada caixa.
 *
 * Aqui as colunas e as linhas **nascem das bordas das caixas**: cada caixa carimbada acrescenta as
 * quatro bordas dela, e a altura é uniforme dentro de cada célula por construção — nenhuma célula é
 * atravessada por uma borda. Por isso a pergunta "qual o topo sob esta pegada" tem resposta exata sem
 * arredondar a pegada: a célula que a pegada toca só em parte tem a mesma altura em toda ela.
 *
 * ⚠️ **As bordas estão em milímetro inteiro.** É a precisão em que a caixa chega (`lengthMm`) e em que
 * a planta é publicada; guardar a soma binária de `0.261 × 3` deixaria duas bordas a 1e-16 m uma da
 * outra, e o arredondamento da publicação faria vizinhas encostadas se cruzarem 1 mm.
 */

/**
 * **A tolerância única de toda comparação horizontal de borda**, em metros.
 *
 * ⚠️ Toda borda é milímetro inteiro, então duas bordas diferentes distam pelo menos 1 mm — mil vezes a
 * tolerância —, e o erro binário de somar medidas (`0.2 × 3 = 0.6000000000000001`) fica 10¹⁰ vezes
 * abaixo dela. É a mesma que os contratos usam para dizer que duas caixas não se cruzam. Foram duas
 * comparações sem folga que produziram a escada de `0.6 / 0.05` (spec 099) e os 383 cruzamentos da
 * spec 115; aqui não existe comparação de borda que não passe por esta constante.
 */
export const EDGE_TOLERANCE_M = 1e-6

const MILLIMETRES_PER_METRE = 1000

/** A borda no milímetro — ver o cabeçalho deste arquivo. */
export function toMillimetreEdge(valueM: number): number {
  return Math.round(valueM * MILLIMETRES_PER_METRE) / MILLIMETRES_PER_METRE
}

/** A medida da caixa em milímetro inteiro, **para cima**: fração de milímetro nunca vira sobreposição. */
export function toMillimetreSize(valueM: number): number {
  return Math.ceil(valueM * MILLIMETRES_PER_METRE - EDGE_TOLERANCE_M) / MILLIMETRES_PER_METRE
}

export type EdgeExtent = Readonly<{ depthM: number; widthM: number; xM: number; yM: number }>

export type EdgeGrid = {
  /** Bordas das colunas, em ordem: a coluna `c` vai de `xs[c]` a `xs[c + 1]`. */
  readonly xs: readonly number[]
  /** Bordas das linhas, em ordem: a linha `l` vai de `ys[l]` a `ys[l + 1]`. */
  readonly ys: readonly number[]
  /** `cells[camada][coluna][linha]` — o valor é uniforme na célula inteira. */
  readonly cells: readonly number[][][]
  /** `columns[camada][coluna]` — valores de coluna inteira. */
  readonly columns: readonly number[][]
  /** Acrescenta as quatro bordas da caixa, sem mudar valor nenhum. */
  readonly splitAt: (extent: EdgeExtent) => void
  /** As colunas que o intervalo toca com comprimento positivo: `[primeira, depois da última)`. */
  readonly columnsOf: (fromM: number, sizeM: number) => readonly [number, number]
  readonly linesOf: (fromM: number, sizeM: number) => readonly [number, number]
  /** A coluna que contém o ponto; a borda pertence à coluna que começa nela. */
  readonly columnAt: (pointM: number) => number
  readonly lineAt: (pointM: number) => number
  /** A coluna logo **antes** do ponto — a que termina nele, ou o contém —; `-1` na parede. */
  readonly columnBefore: (pointM: number) => number
  readonly lineBefore: (pointM: number) => number
  /** O índice da primeira borda de coluna em `valueM` ou depois dele. */
  readonly columnEdgeFrom: (valueM: number) => number
  /**
   * Onde uma caixa de largura `sizeM` pode começar em `y`: encostada numa borda por qualquer um dos
   * dois lados — o começo de uma borda (`b`) ou o fim dela na borda (`b − sizeM`). São os pontos
   * extremos do eixo: fora deles o relevo sob a caixa não muda.
   */
  readonly rowsFor: (input: {
    readonly fromM: number
    readonly sizeM: number
    readonly toM: number
  }) => readonly number[]
  /** O mesmo para `x`, em ordem crescente a partir de `fromM`. */
  readonly columnStartsFor: (input: {
    readonly fromM: number
    readonly sizeM: number
  }) => readonly number[]
}

export function createEdgeGrid(input: {
  readonly cellLayers: number
  readonly columnLayers: number
  readonly lengthM: number
  readonly widthM: number
}): EdgeGrid {
  const xs = [0, toMillimetreEdge(input.lengthM)]
  const ys = [0, toMillimetreEdge(input.widthM)]
  const cells: number[][][] = Array.from({ length: input.cellLayers }, () => [[0]])
  const columns: number[][] = Array.from({ length: input.columnLayers }, () => [0])

  /**
   * Os começos de coluna por `fromM` e medida, até a próxima borda de coluna nova. ⚠️ A varredura pede a
   * mesma lista a cada fileira, e montá-la custava 7% do cálculo do Atego (medido).
   */
  const columnStartsMemo = new Map<number, Map<number, readonly number[]>>()
  const splitColumn = (valueM: number): void => {
    const split = insertEdge(xs, toMillimetreEdge(valueM))
    if (split < 0) return
    columnStartsMemo.clear()
    for (const layer of cells) layer.splice(split + 1, 0, [...(layer[split] ?? [])])
    for (const layer of columns) layer.splice(split + 1, 0, layer[split] ?? 0)
  }
  const splitLine = (valueM: number): void => {
    const split = insertEdge(ys, toMillimetreEdge(valueM))
    if (split < 0) return
    for (const layer of cells) {
      for (const column of layer) column.splice(split + 1, 0, column[split] ?? 0)
    }
  }
  const spanOf = (edges: readonly number[], fromM: number, sizeM: number): [number, number] => {
    const count = edges.length - 1
    const first = Math.min(count - 1, Math.max(0, upperIndex(edges, fromM) - 1))
    const end = Math.min(count, Math.max(first + 1, lowerIndex(edges, fromM + sizeM)))
    return [first, end]
  }
  const indexAt = (edges: readonly number[], pointM: number): number =>
    Math.min(edges.length - 2, Math.max(0, upperIndex(edges, pointM) - 1))
  /**
   * ⚠️ **Antes do ponto não é `indexAt(ponto − tolerância)`.** A busca soma a mesma tolerância, as
   * duas se cancelam e a borda que cai no ponto conta como "depois" dele: a célula devolvida era a que
   * começa na face — dentro da própria caixa —, e a caminhada da contenção achava apoio na altura da
   * base dela. Medido na primeira versão desta spec: 5 caixas sem apoio na Daily e 23 no Accelo.
   */
  const indexBefore = (edges: readonly number[], pointM: number): number =>
    Math.min(edges.length - 2, lowerIndex(edges, pointM) - 1)
  /**
   * ⚠️ Em ordem, sem ordenar: as bordas já estão em ordem, e `b − medida` também. Ordenar a lista a
   * cada assento custava 22% do tempo do Atego (medido na primeira versão, 175 ms contra 50).
   */
  const startsFor = (
    edges: readonly number[],
    fromM: number,
    sizeM: number,
    toM: number,
  ): number[] => {
    const starts: number[] = []
    if (toM < fromM - EDGE_TOLERANCE_M) return starts
    let lastM = Number.NEGATIVE_INFINITY
    const push = (valueM: number): void => {
      if (valueM < fromM - EDGE_TOLERANCE_M || valueM > toM + EDGE_TOLERANCE_M) return
      const edgeM = toMillimetreEdge(valueM)
      if (edgeM - lastM <= EDGE_TOLERANCE_M) return
      starts.push(edgeM)
      lastM = edgeM
    }
    push(fromM)
    const count = edges.length
    let starting = lowerIndex(edges, fromM)
    let ending = lowerIndex(edges, fromM + sizeM)
    while (starting < count || ending < count) {
      const atStartM = starting < count ? (edges[starting] ?? 0) : Number.POSITIVE_INFINITY
      const atEndM = ending < count ? (edges[ending] ?? 0) - sizeM : Number.POSITIVE_INFINITY
      if (Math.min(atStartM, atEndM) > toM + EDGE_TOLERANCE_M) break
      if (atStartM <= atEndM) {
        push(atStartM)
        starting += 1
      } else {
        push(atEndM)
        ending += 1
      }
    }

    return starts
  }

  return {
    cells,
    columnAt: (pointM) => indexAt(xs, pointM),
    columnBefore: (pointM) => indexBefore(xs, pointM),
    columnEdgeFrom: (valueM) => lowerIndex(xs, valueM),
    columnStartsFor: ({ fromM, sizeM }) => {
      let bySize = columnStartsMemo.get(fromM)
      if (bySize === undefined) {
        bySize = new Map()
        columnStartsMemo.set(fromM, bySize)
      }
      let starts = bySize.get(sizeM)
      if (starts === undefined) {
        starts = startsFor(xs, toMillimetreEdge(fromM), sizeM, (xs.at(-1) ?? 0) - sizeM)
        bySize.set(sizeM, starts)
      }
      return starts
    },
    columns,
    columnsOf: (fromM, sizeM) => spanOf(xs, fromM, sizeM),
    lineAt: (pointM) => indexAt(ys, pointM),
    lineBefore: (pointM) => indexBefore(ys, pointM),
    linesOf: (fromM, sizeM) => spanOf(ys, fromM, sizeM),
    rowsFor: ({ fromM, sizeM, toM }) =>
      startsFor(ys, Math.max(0, fromM), sizeM, Math.min(toM, (ys.at(-1) ?? 0) - sizeM)),
    splitAt: ({ depthM, widthM, xM, yM }) => {
      splitColumn(xM)
      splitColumn(xM + depthM)
      splitLine(yM)
      splitLine(yM + widthM)
    },
    xs,
    ys,
  }
}

/**
 * **A base está apoiada na fração pedida?** (spec 135): a área da pegada sobre células cujo topo chega a
 * `levelM` é pelo menos `minFraction` da área da pegada. As células nascem das bordas das caixas, então a
 * soma é exata — nada é amostrado. Quem garante que não há nada **mais alto** que `levelM` sob a pegada é
 * quem chama.
 *
 * ⚠️ Conta a área **sem** apoio e para quando ela passa do que a fração permite: medido no Atego, a
 * pergunta é feita 145 mil vezes por cálculo, e a maioria se decide nas primeiras colunas. A coluna
 * inteira no nível (`columnLow`) ou inteira abaixo dele (`columnHigh`) se decide sem descer às linhas.
 */
export function isBaseSupported(input: {
  readonly columnHigh?: ArrayLike<number>
  readonly columnLow?: ArrayLike<number>
  readonly depthM: number
  readonly grid: EdgeGrid
  readonly layer: readonly (readonly number[])[]
  readonly levelM: number
  readonly minFraction: number
  readonly span: Readonly<{ end: number; first: number; fromLine: number; toLine: number }>
  readonly widthM: number
  readonly xM: number
  readonly yM: number
}): boolean {
  const { layer, span } = input
  const { xs, ys } = input.grid
  const toXM = input.xM + input.depthM
  const toYM = input.yM + input.widthM
  const areaM2 = input.depthM * input.widthM
  const allowedM2 = areaM2 - (input.minFraction - 1e-9) * areaM2
  const lowM = input.levelM - 1e-9
  let unsupportedM2 = 0
  for (let column = span.first; column < span.end; column += 1) {
    const acrossXM = Math.min(xs[column + 1] ?? 0, toXM) - Math.max(xs[column] ?? 0, input.xM)
    if (acrossXM <= 0 || (input.columnLow?.[column] ?? Number.NEGATIVE_INFINITY) >= lowM) continue
    if ((input.columnHigh?.[column] ?? Number.POSITIVE_INFINITY) < lowM) {
      unsupportedM2 += acrossXM * input.widthM
    } else {
      const values = layer[column] ?? []
      for (let line = span.fromLine; line < span.toLine; line += 1) {
        if ((values[line] ?? 0) >= lowM) continue
        const acrossYM = Math.min(ys[line + 1] ?? 0, toYM) - Math.max(ys[line] ?? 0, input.yM)
        if (acrossYM > 0) unsupportedM2 += acrossXM * acrossYM
      }
    }
    if (unsupportedM2 > allowedM2) return false
  }

  return true
}

/** A primeira borda estritamente depois de `valueM`, com a tolerância. */
function upperIndex(edges: readonly number[], valueM: number): number {
  let low = 0
  let high = edges.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((edges[middle] ?? 0) > valueM + EDGE_TOLERANCE_M) high = middle
    else low = middle + 1
  }
  return low
}

/** A primeira borda em `valueM` ou depois dele, com a tolerância. */
function lowerIndex(edges: readonly number[], valueM: number): number {
  let low = 0
  let high = edges.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((edges[middle] ?? 0) >= valueM - EDGE_TOLERANCE_M) high = middle
    else low = middle + 1
  }
  return low
}

/**
 * Acrescenta a borda e devolve o índice do intervalo que ela partiu ao meio — `-1` quando ela já existe
 * (a menos da tolerância) ou cai na parede.
 */
function insertEdge(edges: number[], valueM: number): number {
  const last = edges.at(-1) ?? 0
  if (valueM <= EDGE_TOLERANCE_M || valueM >= last - EDGE_TOLERANCE_M) return -1
  const index = upperIndex(edges, valueM)
  if (Math.abs((edges[index - 1] ?? Number.NEGATIVE_INFINITY) - valueM) <= EDGE_TOLERANCE_M) {
    return -1
  }
  edges.splice(index, 0, valueM)

  return index - 1
}
