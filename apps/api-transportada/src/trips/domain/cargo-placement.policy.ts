/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoBedDimensions } from './cargo-layout.policy.js'

const MILLIMETRES_PER_METRE = 1000
/**
 * Teto de caixas desenhadas. Uma viagem de 300 notas pode ter milhares, e o desenho não fica melhor
 * com duas mil — fica lento e ilegível. O excedente é dito, como tudo que não entra.
 */
const MAX_PLACED_BOXES = 600

/**
 * O porquê de cada caixa estar onde está. **Vocabulário fechado**: motivo que a política não conhece
 * não vira texto livre, ele não existe.
 *
 * ⚠️ É o motivo que separa um desenho de uma instrução. Sem ele o operador vê uma arrumação e não
 * tem como discordar dela — e discordar é o que ele faz melhor que o algoritmo, porque viu a carga.
 */
export const PLACEMENT_REASONS = [
  'lastStopFirst',
  'fragileOnTop',
  'notStackable',
  'keepUpright',
  'estimatedBox',
  'axleNotChecked',
  'splitCargo',
] as const
export type PlacementReason = (typeof PLACEMENT_REASONS)[number]

/** Por que uma caixa ficou de fora. Nomear é obrigatório — sumir com ela, nunca. */
export const UNPLACED_REASONS = ['notMeasured', 'largerThanBed', 'bedFull', 'tooMany'] as const
export type UnplacedReason = (typeof UNPLACED_REASONS)[number]

export type PlacementBox = {
  readonly count: number
  readonly heightMm: number | null
  /** `null` é "ninguém informou", nunca "pode": o nulo empilha e marca o arranjo como presumido. */
  readonly isFragile: boolean | null
  readonly isStackable: boolean | null
  readonly keepUpright: boolean | null
  readonly label: string
  readonly lengthMm: number | null
  readonly maxStackCount: number | null
  readonly source: 'measured' | 'estimated'
  readonly stopSequence: number
  readonly widthMm: number | null
}

export type PlacedBox = {
  readonly depthM: number
  readonly heightM: number
  readonly isFragile: boolean
  readonly label: string
  readonly layer: number
  readonly reasons: readonly PlacementReason[]
  readonly source: 'measured' | 'estimated'
  readonly stopSequence: number
  readonly widthM: number
  /** Distância do fundo do baú (0 é encostado na cabine). */
  readonly xM: number
  /** Distância da parede lateral. */
  readonly yM: number
  /**
   * Altura do piso até a base da caixa.
   *
   * ⚠️ **É o desenho que precisa dela, e reconstruí-la fora daqui dá errado.** A tela somava a altura
   * de cada camada, e a altura de uma camada é o **máximo do baú inteiro** naquele índice: uma fatia
   * de caixas baixas ao lado de outra de caixas altas desenhava a segunda camada com meio metro de ar
   * embaixo, num desenho que promete escala.
   */
  readonly zM: number
}

export type UnplacedBox = {
  readonly count: number
  readonly label: string
  readonly reason: UnplacedReason
}

export type CargoPlacementLayer = {
  readonly boxes: readonly PlacedBox[]
  readonly heightM: number
  readonly index: number
}

export type CargoPlacement = {
  readonly layers: readonly CargoPlacementLayer[]
  /**
   * A pior origem manda, como no volume e no peso: uma caixa presumida — ou uma restrição que
   * ninguém informou — torna presumido o arranjo inteiro. Quem carrega decide pelo pior caso.
   */
  readonly source: 'measured' | 'estimated'
  readonly unplaced: readonly UnplacedBox[]
}

type Slot = {
  readonly depthM: number
  readonly heightM: number
  readonly widthM: number
}

/**
 * Spec 094 e 095: **onde cada caixa cabe**, fatia por fatia e camada por camada.
 *
 * O baú é cortado ao longo do comprimento em uma **fatia por parada**, na ordem inversa de entrega:
 * a última parada encosta na testeira e a primeira fica colada na porta. Dentro da fatia a varredura
 * é em fileiras — enche o piso, quebra para a fileira ao lado, sobe de camada. Não é empacotamento
 * ótimo: isso é NP-difícil, e a diferença não paga o tempo de resposta numa tela de montagem.
 *
 * ⚠️ **A fatia é proibição, não preferência.** Ordenar por parada fazia a última *tender* ao fundo, e
 * bastava a fileira virar para duas paradas dividirem a mesma camada — quem abria a porta na
 * primeira entrega tirava caixa de outra parada de cima. É a restrição LIFO do 3L-CVRP, e ela vale
 * **sem nenhum dado de empilhamento cadastrado**, que é a situação de hoje.
 *
 * ⚠️ **A fatia é dimensionada pelo volume da parada, nunca pela contagem.** Dez caixas pequenas
 * ocupam menos baú que duas grandes; repartir o comprimento em partes iguais estouraria uma fatia e
 * deixaria a outra vazia, e o estouro sairia como carga que não cabe num baú com espaço sobrando.
 *
 * ⚠️ **A promessa é "cabe", não "deve ir assim".** A planta respeita o que está informado e declara
 * o que não está: sem peso por eixo ela nunca diz que a carga pode sair, e sem `is_stackable` ela
 * empilha marcando o arranjo como presumido.
 */
export function resolveCargoPlacement(input: {
  readonly bed: CargoBedDimensions | null
  readonly boxes: readonly PlacementBox[]
}): CargoPlacement | null {
  if (input.bed === null) return null

  const bed = {
    heightM: Number.parseFloat(input.bed.heightM),
    lengthM: Number.parseFloat(input.bed.lengthM),
    widthM: Number.parseFloat(input.bed.widthM),
  }
  if (bed.heightM <= 0 || bed.lengthM <= 0 || bed.widthM <= 0) return null

  const unplaced: UnplacedBox[] = []
  const measured = input.boxes.filter((box) => {
    /**
     * ⚠️ Zero é ausência, não medida — o mesmo vocabulário da ficha do veículo. Uma linha com `0`
     * dava fatia de comprimento zero à parada inteira, e daí toda caixa dela caía na divisão.
     */
    if ((box.heightMm ?? 0) > 0 && (box.lengthMm ?? 0) > 0 && (box.widthMm ?? 0) > 0) {
      return true
    }
    /** Caixa sem medida não entra: posição de palpite é o que a spec 085 recusou por escrito. */
    unplaced.push({ count: box.count, label: box.label, reason: 'notMeasured' })
    return false
  })

  /** Da última parada para a primeira: quem entrega por último viaja no fundo. */
  const sequences = [...new Set(measured.map((box) => box.stopSequence))].sort(
    (first, second) => second - first,
  )
  const totalVolume = volumeOf(measured)

  const rows: PlacedBox[] = []
  const leftovers: { readonly box: PlacementBox; readonly sliceStartM: number }[] = []
  const presumed = measured.some(
    (box) => box.isStackable === null || box.isFragile === null || box.source === 'estimated',
  )
  let placedCount = 0
  let sliceStartM = 0

  for (const stopSequence of sequences) {
    const own = measured.filter((box) => box.stopSequence === stopSequence)
    const share = totalVolume > 0 ? volumeOf(own) / totalVolume : 1 / sequences.length
    const sliceLengthM = sequences.length === 1 ? bed.lengthM : bed.lengthM * share

    const slice = packSlice({
      bed,
      boxes: own,
      budget: MAX_PLACED_BOXES - placedCount,
      sliceLengthM,
      sliceStartM,
    })
    rows.push(...slice.boxes)
    placedCount += slice.boxes.length
    for (const entry of slice.unplaced) pushUnplaced(unplaced, entry)
    for (const box of slice.leftovers) leftovers.push({ box, sliceStartM })
    sliceStartM += sliceLengthM
  }

  rows.push(
    ...placeSplitCargo({ bed, budget: MAX_PLACED_BOXES - placedCount, leftovers, rows, unplaced }),
  )

  return { layers: toLayers(rows), source: presumed ? 'estimated' : 'measured', unplaced }
}

/** O volume que a carga ocupa de fato, em m³ — é ele que dimensiona a fatia. */
function volumeOf(boxes: readonly PlacementBox[]): number {
  return boxes.reduce(
    (total, box) =>
      total +
      (box.count * (box.lengthMm ?? 0) * (box.widthMm ?? 0) * (box.heightMm ?? 0)) /
        MILLIMETRES_PER_METRE ** 3,
    0,
  )
}

/**
 * A varredura em fileiras **dentro de uma fatia**. Nada aqui enxerga o resto do baú: é isso que
 * torna a separação entre paradas uma propriedade da estrutura, e não uma ordenação com sorte.
 */
function packSlice(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly boxes: readonly PlacementBox[]
  readonly budget: number
  readonly sliceLengthM: number
  readonly sliceStartM: number
}): {
  readonly boxes: readonly PlacedBox[]
  readonly leftovers: readonly PlacementBox[]
  readonly unplaced: readonly UnplacedBox[]
} {
  const slice = { ...input.bed, lengthM: input.sliceLengthM }
  const unplaced: UnplacedBox[] = []
  const placed: PlacedBox[] = []
  const leftovers: PlacementBox[] = []
  /** A sobra é candidata a dividir; quem não pode empilhar não sobe em nada e não é candidata. */
  const spill = (box: PlacementBox): void => {
    if (resolveStackLimit(box) <= 1) {
      pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
      return
    }
    leftovers.push({ ...box, count: 1 })
  }

  /**
   * **Frágil no topo de tudo, depois presumida, e a base pela maior pegada.**
   *
   * ⚠️ Frágil e não empilhável vão **por último**: é a única garantia que uma heurística de camadas
   * consegue dar sem virar empacotamento com restrição.
   *
   * ⚠️ A **medição precede a pegada**, e não o contrário. Toda caixa presumida herda a mesma caixa
   * do fallback, então ordenar só por pegada as agrupava numa faixa contígua no meio da fatia — o
   * tamanho do fallback fica no meio da escala. Com a presumida por cima o agrupamento vira decisão:
   * o que precisa de fita fica à mão, sem desmontar pilha, e a base fica com o que tem medida.
   *
   * ⚠️ A pegada decrescente é o critério de base — caixa grande sob caixa pequena é a pilha que
   * desaba —, e é o único critério de empilhamento que vale **sem nenhum dado cadastrado**.
   */
  const ordered = [...input.boxes].sort(
    (first, second) =>
      rankTopOnly(first) - rankTopOnly(second) ||
      rankPresumed(first) - rankPresumed(second) ||
      footprintOf(second) - footprintOf(first),
  )

  let cursor = { layer: 0, layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }

  for (const box of ordered) {
    const stackLimit = resolveStackLimit(box)

    for (let unit = 0; unit < box.count; unit += 1) {
      const slot = fitSlot({ bed: slice, box })
      if (slot === null) {
        /** Não cabe na fatia: só é "maior que o baú" se não couber nem no baú inteiro. */
        if (fitSlot({ bed: input.bed, box }) === null) {
          pushUnplaced(unplaced, {
            count: box.count - unit,
            label: box.label,
            reason: 'largerThanBed',
          })
          break
        }
        /** Cabe no baú e não na fatia: é divisão de carga, não carga grande demais. */
        for (let rest = unit; rest < box.count; rest += 1) spill(box)
        break
      }
      if (placed.length >= input.budget) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'tooMany' })
        continue
      }
      if (cursor.xM + slot.depthM > slice.lengthM + 1e-9) {
        cursor = { ...cursor, rowWidthM: 0, xM: 0, yM: cursor.yM + cursor.rowWidthM }
      }
      if (cursor.yM + slot.widthM > slice.widthM + 1e-9) {
        cursor = {
          layer: cursor.layer + 1,
          layerBottomM: cursor.layerBottomM + cursor.layerHeightM,
          layerHeightM: 0,
          rowWidthM: 0,
          xM: 0,
          yM: 0,
        }
      }
      /**
       * ⚠️ O limite de pilha é conferido **depois** de a camada eventualmente fechar. Antes dele, a
       * caixa que provocava o fechamento escapava para a camada de cima — e uma caixa declarada não
       * empilhável acabava empilhada, que é o oposto do que o campo diz.
       */
      if (cursor.layer >= stackLimit) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
        continue
      }
      if (cursor.layerBottomM + slot.heightM > slice.heightM + 1e-9) {
        spill(box)
        continue
      }

      placed.push({
        depthM: round(slot.depthM),
        heightM: round(slot.heightM),
        isFragile: box.isFragile === true,
        label: box.label,
        layer: cursor.layer,
        reasons: resolveReasons(box),
        source: box.source,
        stopSequence: box.stopSequence,
        widthM: round(slot.widthM),
        xM: round(input.sliceStartM + cursor.xM),
        yM: round(cursor.yM),
        zM: round(cursor.layerBottomM),
      })
      cursor = {
        ...cursor,
        layerHeightM: Math.max(cursor.layerHeightM, slot.heightM),
        rowWidthM: Math.max(cursor.rowWidthM, slot.widthM),
        xM: cursor.xM + slot.depthM,
      }
    }
  }

  return { boxes: placed, leftovers, unplaced }
}

/** Lado da célula do mapa de alturas, em metros. Fino o bastante para uma caixa de 20 cm. */
const HEIGHT_MAP_CELL_M = 0.05

/**
 * Teto de caixas divididas. A busca de lugar para a sobra varre o baú inteiro por caixa, e passar
 * de algumas dezenas custa mais que o desenho vale — e uma divisão de centenas de caixas não é um
 * plano de carregamento, é um caminhão pequeno demais, que a tela já diz de outro jeito.
 */
const MAX_SPLIT_BOXES = 40

/**
 * **A carga que não coube na própria fatia é dividida — e a divisão tem lugar certo.**
 *
 * A sobra da parada N sobe para a camada de cima da região das paradas entregues **depois** dela —
 * mais fundo no baú —, encostada na própria fatia. Ali ela cumpre as três coisas ao mesmo tempo:
 * nada por cima dela, o corredor até ela já está livre quando a vez dela chega, e ela sai marcada
 * com `splitCargo` em vez de sumir no meio da pilha.
 *
 * ⚠️ O sentido contrário — empurrar a sobra para o lado da porta — é proibido: seria carga de parada
 * posterior em cima de quem entrega antes, exatamente o problema que a fatia veio resolver. Por isso
 * a busca só olha `x` **menor** que o começo da fatia da própria parada, e a sobra da última parada
 * não tem para onde ir.
 */
function placeSplitCargo(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly budget: number
  readonly leftovers: readonly { readonly box: PlacementBox; readonly sliceStartM: number }[]
  readonly rows: readonly PlacedBox[]
  readonly unplaced: UnplacedBox[]
}): readonly PlacedBox[] {
  const columns = Math.max(1, Math.ceil(input.bed.lengthM / HEIGHT_MAP_CELL_M))
  const lines = Math.max(1, Math.ceil(input.bed.widthM / HEIGHT_MAP_CELL_M))
  const topM = new Float64Array(columns * lines)
  const topLayer = new Int32Array(columns * lines).fill(-1)

  const cellsOf = (fromM: number, sizeM: number, limit: number): readonly [number, number] => [
    Math.max(0, Math.floor(fromM / HEIGHT_MAP_CELL_M)),
    Math.min(limit, Math.ceil((fromM + sizeM) / HEIGHT_MAP_CELL_M)),
  ]

  /**
   * ⚠️ O mapa guarda o **topo absoluto** da coluna, nunca a altura própria da caixa. Carimbar a
   * altura da caixa fazia o apoio ser subestimado, e a sobra passava pelo portão do teto: medido,
   * caixas divididas saíam em 2,80 e 3,50 m dentro de um baú de 2,30.
   */
  const stamp = (entry: {
    depthM: number
    layer: number
    topM: number
    widthM: number
    xM: number
    yM: number
  }): void => {
    const [fromColumn, toColumn] = cellsOf(entry.xM, entry.depthM, columns)
    const [fromLine, toLine] = cellsOf(entry.yM, entry.widthM, lines)
    for (let column = fromColumn; column < toColumn; column += 1) {
      for (let line = fromLine; line < toLine; line += 1) {
        const cell = column * lines + line
        topM[cell] = Math.max(topM[cell] ?? 0, entry.topM)
        topLayer[cell] = Math.max(topLayer[cell] ?? -1, entry.layer)
      }
    }
  }

  for (const entry of input.rows) stamp({ ...entry, topM: entry.zM + entry.heightM })

  const placed: PlacedBox[] = []
  /** Da parada mais próxima da porta para a mais funda: quem tem menos fundo disponível escolhe antes. */
  const queue = [...input.leftovers].sort(
    (first, second) => first.box.stopSequence - second.box.stopSequence,
  )

  /**
   * ⚠️ O teto conta **tentativas**, não colocações. Contando só o que entrou, a sobra que não acha
   * lugar nunca satura o limite e cada caixa paga a varredura inteira do baú: medido, 1817 ms para
   * 900 caixas volumosas — justamente o caso em que a divisão existe.
   */
  let attempts = 0

  for (const { box, sliceStartM } of queue) {
    attempts += 1
    if (placed.length >= input.budget || attempts > MAX_SPLIT_BOXES) {
      pushUnplaced(input.unplaced, { count: 1, label: box.label, reason: 'tooMany' })
      continue
    }
    const slot = fitSlot({ bed: input.bed, box })
    const spot =
      slot === null
        ? null
        : findSplitSpot({
            cellsOf,
            columns,
            lines,
            sliceStartM,
            slot,
            topLayer,
            topM,
            bed: input.bed,
          })
    if (slot === null || spot === null) {
      pushUnplaced(input.unplaced, { count: 1, label: box.label, reason: 'bedFull' })
      continue
    }

    const entry: PlacedBox = {
      depthM: round(slot.depthM),
      heightM: round(slot.heightM),
      isFragile: box.isFragile === true,
      label: box.label,
      layer: spot.layer,
      reasons: [...resolveReasons(box), 'splitCargo'],
      source: box.source,
      stopSequence: box.stopSequence,
      widthM: round(slot.widthM),
      xM: round(spot.xM),
      yM: round(spot.yM),
      zM: round(spot.topM),
    }
    placed.push(entry)
    stamp({ ...entry, topM: spot.topM + slot.heightM })
  }

  return placed
}

/**
 * O ponto mais raso da região funda que ainda aceita a caixa, encostado na fatia de origem.
 *
 * ⚠️ Varre de trás para a frente a partir da própria fatia e **para no primeiro `x` que serve**:
 * quanto mais perto da fatia de origem, menos a carga de uma parada se espalha pelo baú.
 */
function findSplitSpot(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly cellsOf: (fromM: number, sizeM: number, limit: number) => readonly [number, number]
  readonly columns: number
  readonly lines: number
  readonly sliceStartM: number
  readonly slot: Slot
  readonly topLayer: Int32Array
  readonly topM: Float64Array
}): {
  readonly layer: number
  readonly topM: number
  readonly xM: number
  readonly yM: number
} | null {
  /**
   * O passo da busca é grosso de propósito: a sobra pousa **em cima** do que já está lá, então
   * precisão de centímetro aqui não muda onde ela fica — e a varredura fina custava metade do
   * orçamento de resposta da tela.
   */
  const step = HEIGHT_MAP_CELL_M * 4

  for (let xM = input.sliceStartM - input.slot.depthM; xM >= -1e-9; xM -= step) {
    let best: { layer: number; topM: number; xM: number; yM: number } | null = null

    for (let yM = 0; yM + input.slot.widthM <= input.bed.widthM + 1e-9; yM += step) {
      const [fromColumn, toColumn] = input.cellsOf(
        Math.max(0, xM),
        input.slot.depthM,
        input.columns,
      )
      const [fromLine, toLine] = input.cellsOf(yM, input.slot.widthM, input.lines)
      let support = 0
      let layer = 0
      for (let column = fromColumn; column < toColumn; column += 1) {
        for (let line = fromLine; line < toLine; line += 1) {
          const cell = column * input.lines + line
          support = Math.max(support, input.topM[cell] ?? 0)
          layer = Math.max(layer, (input.topLayer[cell] ?? -1) + 1)
        }
      }
      if (support + input.slot.heightM > input.bed.heightM + 1e-9) continue
      if (best === null || support < best.topM) {
        best = { layer, topM: support, xM: Math.max(0, xM), yM }
      }
      /** Piso livre é o melhor que existe nesta faixa: não há o que continuar procurando. */
      if (support === 0) break
    }
    if (best !== null) return best
  }

  return null
}

/**
 * As camadas do baú inteiro, montadas a partir das fatias.
 *
 * ⚠️ A camada é **do baú**, não da fatia: "camada 1" tem de significar o piso em toda a extensão,
 * senão a navegação por camada da tela mostraria o piso de uma parada ao lado da segunda pilha de
 * outra.
 */
function toLayers(boxes: readonly PlacedBox[]): readonly CargoPlacementLayer[] {
  const byIndex = new Map<number, PlacedBox[]>()
  for (const box of boxes) {
    const existing = byIndex.get(box.layer)
    if (existing === undefined) byIndex.set(box.layer, [box])
    else existing.push(box)
  }

  return [...byIndex.entries()]
    .sort(([first], [second]) => first - second)
    .map(([index, layer]) => ({
      boxes: layer,
      heightM: Math.max(...layer.map((box) => box.heightM)),
      index,
    }))
}

/**
 * A proporção da caixa quando a empresa não mediu nenhuma: a base modular do palete PBR (40 × 30
 * cm), que é a que fecha a face com dez caixas por camada. Altura em 25 cm, o meio da faixa
 * observada.
 */
const CATALOGUE_RATIO = { heightM: 0.25, lengthM: 0.4, widthM: 0.3 } as const

export type MeasuredBoxShape = {
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

export type FallbackBox = {
  readonly heightMm: number
  readonly lengthMm: number
  readonly widthMm: number
}

/**
 * A **caixa presumida**: sem medida, o desenho ainda posiciona — derivando uma caixa daquele volume,
 * na proporção da que a empresa já mediu.
 *
 * ⚠️ **Proporção, não cubo.** Um cubo de 0,021 m³ tem 27,6 cm de lado e empilha diferente de uma
 * caixa de 38 × 26 × 21 — e a planta é justamente sobre como as peças se arrumam no piso. A forma
 * importa tanto quanto o volume.
 *
 * ⚠️ A mediana, não a média: uma caixa de geladeira no meio de mil de refrigerante move a média e
 * não move a mediana — a mesma razão que a spec 085 registra para o volume.
 *
 * Sem volume não há caixa: inventar tamanho não é estimar.
 */
export function resolveFallbackBox(input: {
  readonly measured: readonly MeasuredBoxShape[]
  readonly volumeM3: number | null
}): FallbackBox | null {
  if (input.volumeM3 === null || input.volumeM3 <= 0) return null

  const ratio = resolveShapeRatio(input.measured)
  const referenceVolume = ratio.heightM * ratio.lengthM * ratio.widthM
  if (referenceVolume <= 0) return null

  /** Escala linear: o volume cresce com o cubo, então o fator é a raiz cúbica da razão. */
  const scale = Math.cbrt(input.volumeM3 / referenceVolume)

  return {
    heightMm: Math.round(ratio.heightM * scale * MILLIMETRES_PER_METRE),
    lengthMm: Math.round(ratio.lengthM * scale * MILLIMETRES_PER_METRE),
    widthMm: Math.round(ratio.widthM * scale * MILLIMETRES_PER_METRE),
  }
}

/** A forma típica da empresa — mediana de cada dimensão, ou o catálogo quando não há nenhuma. */
function resolveShapeRatio(
  measured: readonly MeasuredBoxShape[],
): Readonly<{ heightM: number; lengthM: number; widthM: number }> {
  if (measured.length === 0) return CATALOGUE_RATIO

  return {
    heightM: median(measured.map((box) => box.heightMm)) / MILLIMETRES_PER_METRE,
    lengthM: median(measured.map((box) => box.lengthMm)) / MILLIMETRES_PER_METRE,
    widthM: median(measured.map((box) => box.widthMm)) / MILLIMETRES_PER_METRE,
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * Quantas camadas esta caixa aceita ter **abaixo** dela. Zero é "só o piso": não empilhável e frágil
 * ficam por cima, e sem informação a caixa empilha à vontade — marcando o arranjo como presumido.
 */
function resolveStackLimit(box: PlacementBox): number {
  if (box.isStackable === false || box.isFragile === true) return 1
  return box.maxStackCount ?? Number.POSITIVE_INFINITY
}

/** A presumida entra depois da medida, para a base ficar com a medida de verdade. */
function rankPresumed(box: PlacementBox): number {
  return box.source === 'estimated' ? 1 : 0
}

/** A área que a caixa apoia no piso, em m² — o critério de quem serve de base. */
function footprintOf(box: PlacementBox): number {
  return ((box.lengthMm ?? 0) * (box.widthMm ?? 0)) / MILLIMETRES_PER_METRE ** 2
}

/** Frágil e não empilhável entram por último, para caírem na camada de cima. */
function rankTopOnly(box: PlacementBox): number {
  return box.isFragile === true || box.isStackable === false ? 1 : 0
}

/**
 * A caixa no plano, com as duas orientações. Girar em torno do eixo vertical é sempre permitido — é
 * o mesmo lado no chão; `keepUpright` proíbe **deitar**, que é usar a altura como base, e confundir
 * os dois faria a planta recusar caixa que cabe perfeitamente virada.
 */
function fitSlot(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly box: PlacementBox
}): Slot | null {
  const lengthM = (input.box.lengthMm ?? 0) / MILLIMETRES_PER_METRE
  const widthM = (input.box.widthMm ?? 0) / MILLIMETRES_PER_METRE
  const heightM = (input.box.heightMm ?? 0) / MILLIMETRES_PER_METRE
  if (heightM > input.bed.heightM) return null

  const orientations: readonly Slot[] = [
    { depthM: lengthM, heightM, widthM },
    { depthM: widthM, heightM, widthM: lengthM },
  ]

  return (
    orientations.find(
      (slot) => slot.depthM <= input.bed.lengthM && slot.widthM <= input.bed.widthM,
    ) ?? null
  )
}

function resolveReasons(box: PlacementBox): readonly PlacementReason[] {
  const reasons: PlacementReason[] = ['lastStopFirst']
  if (box.isFragile === true) reasons.push('fragileOnTop')
  if (box.isStackable === false) reasons.push('notStackable')
  if (box.keepUpright === true) reasons.push('keepUpright')
  if (box.source === 'estimated') reasons.push('estimatedBox')

  return reasons
}

/** Uma linha por motivo e por rótulo: dez caixas iguais fora não viram dez avisos. */
function pushUnplaced(list: UnplacedBox[], entry: UnplacedBox): void {
  const existing = list.find((item) => item.label === entry.label && item.reason === entry.reason)
  if (existing === undefined) {
    list.push(entry)
    return
  }
  list.splice(list.indexOf(existing), 1, { ...existing, count: existing.count + entry.count })
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
