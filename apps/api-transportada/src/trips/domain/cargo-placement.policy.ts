/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import type { CargoBedDimensions } from './cargo-layout.policy.js'
import {
  createEdgeGrid,
  EDGE_TOLERANCE_M,
  type EdgeExtent,
  type EdgeGrid,
  isBaseSupported,
  toMillimetreEdge,
  toMillimetreSize,
} from './cargo-edge-grid.js'

/**
 * **A base apoiada mínima** (spec 135): a fração da área da base que tem de estar sobre topo à altura
 * do assento — decisão do usuário, em porcentagem e não em centímetros. Uma folga de 1 cm é 96% de
 * apoio numa caixa de 26 cm e 99% numa de 1 m: a mesma régua para caixas de tamanhos diferentes
 * mede coisas diferentes.
 *
 * ⚠️ É o critério de apoio parcial da literatura de carregamento de contêiner (Junqueira, Morabito e
 * Yamashita, 2012; revisão de Bortfeldt e Wäscher, 2013): uma fração mínima da base sobre as caixas de
 * baixo. Qualquer fração acima de metade põe o centro da base dentro do contorno do apoio — sem isso
 * haveria uma reta pelo centro com todo o apoio de um lado, e ele seria no máximo metade —, então a
 * caixa de massa uniforme não gira sobre a borda. O valor exato é escolha, não física medida: ninguém
 * mediu a massa dentro da caixa, e o número foi escolhido por medição nas viagens reais.
 */
export const MIN_SUPPORTED_BASE_FRACTION = 0.8

/**
 * **A escora mais estreita que conta** (spec 132): a caixa de baixo que passa 1 mm da face da de cima
 * não escora nada. É a mesma régua do juiz da descarga (`MIN_BRACE_CONTACT_M`).
 */
const MIN_BRACE_CONTACT_M = 0.01

const MILLIMETRES_PER_METRE = 1000

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
  'weightBalanced',
  'outOfReach',
  'needsRehandling',
] as const
export type PlacementReason = (typeof PLACEMENT_REASONS)[number]

/**
 * Spec 120: **o complemento** — a caixa que o mapa recomendado não colocou e que entrou no espaço livre
 * afrouxando uma regra de conveniência, do mais leve ao mais pesado. `outOfReach` é funda demais para a
 * mão de quem fica de pé no piso; `needsRehandling` fura a ordem de descarga, e alguém mexe em outra
 * entrega para chegar nela (ou nela para chegar em outra).
 *
 * ⚠️ Nenhum dos dois afrouxa física: dentro do baú, nada atravessando nada, nada no ar, pilha de pé no
 * carregamento **e** na descarga — a caixa do complemento só se apoia em entrega que sai depois dela.
 */
export const COMPLEMENT_REASONS = ['outOfReach', 'needsRehandling'] as const
export type ComplementReason = (typeof COMPLEMENT_REASONS)[number]

/** Se a caixa entrou pelo complemento, e não pelo mapa recomendado. */
export function isComplementBox(box: Readonly<{ reasons: readonly PlacementReason[] }>): boolean {
  return box.reasons.some((reason) => reason === 'outOfReach' || reason === 'needsRehandling')
}

/** Por que uma caixa ficou de fora. Nomear é obrigatório — sumir com ela, nunca. */
export const UNPLACED_REASONS = ['notMeasured', 'largerThanBed', 'bedFull', 'tooMany'] as const
export type UnplacedReason = (typeof UNPLACED_REASONS)[number]

export type PlacementBox = {
  readonly count: number
  /**
   * Spec 119: a nota de origem, só de carona. ⚠️ Nenhuma comparação, chave de formato ou ordenação
   * pode ler estes dois campos — é isso que garante que a nota não move caixa nenhuma.
   */
  readonly documentId?: string | null
  readonly documentNumber?: string | null
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
  /** Spec 119: a nota de origem (`nfe_documents.id`) e o número impresso; `null` quando não se sabe. */
  readonly documentId: string | null
  readonly documentNumber: string | null
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
  /**
   * Spec 120: as notas que o desenho dividiu, com quantos pedaços cada uma tem. **Pedaço** é um grupo de
   * caixas da mesma nota ligadas por contato de face — encostadas numa face, com vão menor que uma célula
   * do mapa de alturas (5 cm) e sobreposição nos outros dois eixos. Nota inteira não entra na lista.
   *
   * ⚠️ Opcional no tipo porque só `resolveCargoPlacement` a monta, sobre o que o desenho de fato mostra.
   */
  readonly splitNotes?: readonly NotePieces[]
  readonly unplaced: readonly UnplacedBox[]
}

export type NotePieces = Readonly<{ documentId: string; pieces: number }>

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
export function resolveCargoPlacement(
  input: Parameters<typeof placeCargo>[0],
): CargoPlacement | null {
  const placement = placeCargo(input)
  if (placement === null) return null

  /**
   * ⚠️ **Spec 131: toda caixa empacotada vai para o desenho.** Até aqui um teto de 1500 aparava a
   * planta pela caixa mais alta, e a tela avisava "fora do desenho por limite de detalhe" — carga que
   * está no baú, escondida porque o SVG ficava lento. Desenho lento é defeito do desenho, e é lá que se
   * corrige (`components/ui/cargo-isometric.tsx`); esconder carga nunca é a correção.
   */
  return {
    ...placement,
    splitNotes: resolveSplitNotes(placement.layers.flatMap((layer) => layer.boxes)),
  }
}

/**
 * Spec 120: quantos pedaços cada nota tem no desenho — ver `CargoPlacement.splitNotes`.
 *
 * ⚠️ O vão tolerado é `NOTE_TOUCH_GAP_M`: até a spec 132 a caixa ocupava células inteiras de 5 cm, e
 * duas presumidas de 0,261 m encostadas ficavam a 3,9 cm uma da outra no desenho. Com a medida exata
 * elas encostam de fato, e a folga ficou como leitura — vão menor que ela não parte a nota em dois.
 */
export function resolveSplitNotes(boxes: readonly PlacedBox[]): readonly NotePieces[] {
  const byNote = new Map<string, PlacedBox[]>()
  for (const box of boxes) {
    if (box.documentId === null) continue
    byNote.set(box.documentId, [...(byNote.get(box.documentId) ?? []), box])
  }
  const split: NotePieces[] = []
  for (const [documentId, own] of byNote) {
    const pieces = countPieces(own)
    if (pieces > 1) split.push({ documentId, pieces })
  }

  return split.sort((first, second) => (first.documentId < second.documentId ? -1 : 1))
}

function countPieces(boxes: readonly PlacedBox[]): number {
  const parent = boxes.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parent[root] !== root) root = parent[root] ?? root
    parent[index] = root
    return root
  }
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first]
      const b = boxes[second]
      if (a !== undefined && b !== undefined && areTouching(a, b)) {
        parent[find(first)] = find(second)
      }
    }
  }

  return new Set(boxes.map((_, index) => find(index))).size
}

type BoxExtent = Readonly<{
  depthM: number
  heightM: number
  widthM: number
  xM: number
  yM: number
  zM: number
}>

/** Contato de face: encostadas num eixo (vão menor que `NOTE_TOUCH_GAP_M`; no vertical, pousada) e sobrepostas nos outros dois. */
function areTouching(first: BoxExtent, second: BoxExtent): boolean {
  const axes = [
    [first.xM, first.depthM, second.xM, second.depthM],
    [first.yM, first.widthM, second.yM, second.widthM],
    [first.zM, first.heightM, second.zM, second.heightM],
  ] as const
  return axes.some((axis, index) => {
    const [fromA, sizeA, fromB, sizeB] = axis
    const gap = Math.max(fromB - (fromA + sizeA), fromA - (fromB + sizeB))
    const tolerance = index === 2 ? 1e-3 : NOTE_TOUCH_GAP_M - EDGE_TOLERANCE_M
    if (gap < -1e-6 || gap > tolerance) return false
    return axes.every((other, otherIndex) => {
      if (otherIndex === index) return true
      const [fromC, sizeC, fromD, sizeD] = other
      return (
        Math.min(fromC + sizeC, fromD + sizeD) - Math.max(fromC, fromD) > NOTE_CONTACT_OVERLAP_M
      )
    })
  })
}

/** A sobreposição mínima que faz de duas caixas vizinhas de face — menos que isso é quina. */
const NOTE_CONTACT_OVERLAP_M = 0.01

/** O vão que a leitura das notas ainda chama de contato de face — era a célula de 5 cm (spec 135). */
const NOTE_TOUCH_GAP_M = 0.05

function placeCargo(input: {
  readonly bed: CargoBedDimensions | null
  readonly boxes: readonly PlacementBox[]
  /**
   * Por onde este veículo carrega. Ausente assume `rear`, o **mais restritivo** — a mesma omissão
   * segura de `resolveCargoLayout`: supor lateral diria que dá para alcançar o meio de um baú que
   * só abre atrás.
   */
  /**
   * O arranjo já decidido por quem chama. ⚠️ Existe para `resolveCargoLayout` decidir **uma vez** e a
   * tabela e o desenho herdarem a mesma decisão: resolver duas vezes é a porta pela qual as duas
   * políticas passam a discordar, e nada falha quando isso acontece.
   *
   * Ausente, a política resolve o próprio arranjo — é o que mantém `resolveCargoPlacement` utilizável
   * sozinha, como os contratos a usam.
   */
  readonly arrangement?: StopArrangement
  /** Spec 115: as faixas da grade, quando quem decidiu o arranjo já as escolheu. */
  readonly laneCount?: number
  /** Spec 118: quando esta chamada empacota uma faixa da grade, as bordas que são outra faixa. */
  readonly openLaneSides?: OpenSides
  readonly loadingAccess?: LoadingAccess
  /**
   * Spec 100: algum motorista da viagem amarra a carga com cinta. ⚠️ Ausente é **não**, e o padrão é
   * o que decide: supor cinta desenharia pilha alta para quem não amarra.
   */
  readonly securesCargo?: boolean
  /**
   * Quanto do teto de massa da ficha a carga ocupa — `cargoWeight.payloadRatio`, o mesmo número que
   * o painel imprime. `null` é teto desconhecido, e sem denominador não se afirma nada.
   */
  readonly payloadRatio?: string | null
  /**
   * Spec 120: se o que o mapa recomendado não colocou tenta o complemento. Ausente é **sim**; a decisão
   * do arranjo passa `false`, porque ela compara os mapas recomendados — o complemento não pode mudar
   * qual arranjo vale.
   */
  readonly complement?: boolean
}): CargoPlacement | null {
  if (input.bed === null) return null
  const reusable =
    input.arrangement === 'depth' &&
    input.laneCount === undefined &&
    input.openLaneSides === undefined
  const previous = lastDepthPacking
  if (
    reusable &&
    previous !== null &&
    previous.bed === input.bed &&
    previous.boxes === input.boxes &&
    previous.complement === (input.complement !== false) &&
    previous.loadingAccess === (input.loadingAccess ?? 'rear') &&
    previous.payloadRatio === (input.payloadRatio ?? null) &&
    previous.securesCargo === (input.securesCargo === true)
  ) {
    return previous.placement
  }
  const placement = placeCargoOnce({ ...input, bed: input.bed })
  if (reusable) {
    lastDepthPacking = {
      bed: input.bed,
      boxes: input.boxes,
      complement: input.complement !== false,
      loadingAccess: input.loadingAccess ?? 'rear',
      payloadRatio: input.payloadRatio ?? null,
      placement,
      securesCargo: input.securesCargo === true,
    }
  }

  return placement
}

function placeCargoOnce(
  input: Parameters<typeof placeCargo>[0] & { readonly bed: CargoBedDimensions },
): CargoPlacement | null {
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

  /**
   * Em que eixo as paradas se dividem (spec 100). ⚠️ A **mesma** chamada que `resolveCargoLayout`
   * faz: as duas políticas desenham a mesma viagem, e decidir separado faria a planta mostrar faixas
   * enquanto a tabela descreve profundidade — as duas plausíveis, uma errada, e nada falhando.
   */
  const decided =
    input.arrangement === undefined
      ? resolveStopArrangement({
          bed: input.bed,
          boxes: input.boxes,
          loadingAccess: input.loadingAccess ?? 'rear',
          payloadRatio: input.payloadRatio ?? null,
          ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
        })
      : null
  const arrangement = input.arrangement ?? decided?.arrangement ?? 'depth'
  const laneCount = input.laneCount ?? decided?.laneCount
  if (arrangement === 'grid') {
    const grid = resolveGridLanes({
      bedHeightM: bed.heightM,
      bedLengthM: bed.lengthM,
      bedWidthM: bed.widthM,
      boxes: measured,
      ...(laneCount === undefined ? {} : { maxLanes: laneCount }),
    })
    if (grid !== null) {
      return placeGrid({
        bed: input.bed,
        boxes: measured,
        complement: input.complement !== false,
        grid,
        loadingAccess: input.loadingAccess,
        payloadRatio: input.payloadRatio,
        securesCargo: input.securesCargo,
        unplaced,
      })
    }
  }
  const lanes = arrangement === 'lanes'

  /**
   * ⚠️ **A faixa é a fatia com o baú girado 90°** (spec 100 D1). Empacotar num baú de comprimento e
   * largura trocados reusa a varredura inteira, com o mapa de apoio e o crescimento da fatia; o
   * `x ↔ y` é destrocado ao devolver. `fitSlot` já testa as duas orientações de cada caixa, então a
   * rotação é fisicamente honesta — uma caixa girada em torno do eixo vertical é a mesma caixa.
   *
   * ⚠️ No espaço girado a varredura avança ao longo da **largura real** e quebra fileira ao longo da
   * **profundidade real**: cada faixa se enche a partir da porta para dentro, sem nenhuma regra nova.
   */
  const packBed = lanes ? { ...bed, lengthM: bed.widthM, widthM: bed.lengthM } : bed

  /**
   * Em profundidade, da última parada para a primeira: quem entrega por último viaja no fundo.
   *
   * ⚠️ Em faixas a ordem **inverte**: a primeira entrega fica na faixa mais à mão, que é `y = 0` — o
   * lado em que o desenho põe a porta lateral. Sem um lado fixo, duas viagens parecidas sairiam
   * espelhadas e o operador não teria como prever nada.
   */
  const sequences = [...new Set(measured.map((box) => box.stopSequence))].sort((first, second) =>
    lanes ? first - second : second - first,
  )
  const totalVolume = volumeOf(measured)

  const rows: PlacedBox[] = []
  const leftovers: {
    readonly box: PlacementBox
    readonly sliceSizeM: number
    readonly sliceStartM: number
  }[] = []
  const presumed = measured.some(
    (box) => box.isStackable === null || box.isFragile === null || box.source === 'estimated',
  )

  /**
   * ⚠️ **A fatia é do tamanho da carga, e a carga encosta na porta.** A fatia já era proporcional ao
   * volume da parada, mas a proporção era do **baú inteiro**: trinta caixas que cabiam num metro
   * eram esticadas pelos seis metros do baú, uma fileira rasteira por parada, porque a varredura só
   * quebra para a fileira ao lado quando o `x` estoura o fim da fatia. Medido na tela de montagem:
   * três paradas, uma camada, o baú inteiro — e todas caberiam encostadas na porta.
   *
   * A proporção de hoje vira **teto**, não medida: cada parada continua com a mesma garantia de
   * espaço, e o que ela usa é o que a carga dela pede. O que sobra vira vão entre a testeira e a
   * carga, nunca vão entre paradas — o bloco é deslocado inteiro para terminar na porta, que é por
   * onde ele sai.
   *
   * ⚠️ Isto **não** confere peso por eixo: concentrar carga sobre o eixo traseiro é decisão de quem
   * carrega, e a planta continua dizendo `axleNotChecked`.
   */
  /** O que sobra da largura depois de todo mundo ter o mínimo — repartido por volume. */
  /**
   * ⚠️ **Spec 114: em profundidade a carga é um bloco só.** A fatia isolada por parada da 095 deixava
   * dezenas de paradas pequenas com uma ou duas caixas de fundo cada — toda pilha livre, cortada pela
   * esbeltez em 0,75 m, e 38 de 85 paradas fora do desenho num baú 30% cheio.
   */
  /**
   * ⚠️ A faixa da grade com uma parada só também vai para o bloco (spec 118): é ele que sabe que a borda
   * da faixa é outra faixa, e a fatia de parada única trataria a vizinha como parede.
   */
  if (!lanes && (sequences.length > 1 || input.openLaneSides !== undefined)) {
    return placeDeliveryBlock({
      balanced: shouldBalanceLoad({
        loadingAccess: input.loadingAccess ?? 'rear',
        payloadRatio: input.payloadRatio ?? null,
      }),
      bed,
      boxes: measured,
      complement: input.complement !== false,
      ...(input.openLaneSides === undefined ? {} : { openSides: input.openLaneSides }),
      presumed,
      securesCargo: input.securesCargo === true,
      unplaced,
    })
  }

  const laneSlackM = !lanes
    ? 0
    : Math.max(
        0,
        packBed.lengthM -
          sequences.reduce(
            (total, stopSequence) =>
              total +
              minimumLaneWidthOf(measured.filter((box) => box.stopSequence === stopSequence)),
            0,
          ),
      )

  const slices = sequences.map((stopSequence, index) => {
    const own = measured.filter((box) => box.stopSequence === stopSequence)
    const share = totalVolume > 0 ? volumeOf(own) / totalVolume : 1 / sequences.length
    /**
     * ⚠️ **Em faixas o mínimo vem primeiro, e só a sobra é proporcional.** A largura que a parada
     * exige é caber a caixa mais larga dela; repartir a largura por volume dava faixa de 0,28 m a
     * uma caixa de 0,30 m — e a parada inteira caía na divisão, num baú com espaço sobrando.
     */
    const capM =
      sequences.length === 1
        ? packBed.lengthM
        : lanes
          ? minimumLaneWidthOf(own) + laneSlackM * share
          : packBed.lengthM * share

    return packUntilItFits({
      bed: packBed,
      boxes: own,
      budget: Number.POSITIVE_INFINITY,
      capM,
      securesCargo: input.securesCargo === true,
      /** Em faixas a fileira gasta profundidade: sobe-se antes de andar para o fundo (spec 100). */
      stackBeforeRow: lanes,
      /**
       * ⚠️ Spec 118: a faixa vizinha não é parede — a da entrega anterior sai antes, e a pilha que
       * encostava nela ficava solta (medido na Fiorino da spec 100: 2 caixas sem apoio). Só a primeira
       * faixa encosta na parede; o vão de largura sobra depois da última.
       */
      ...(lanes ? { openSides: { columnEnd: true, columnStart: index > 0 } } : {}),
    })
  })

  const freeM = Math.max(
    0,
    packBed.lengthM - slices.reduce((total, slice) => total + slice.lengthM, 0),
  )
  const balanced = shouldBalanceLoad({
    loadingAccess: input.loadingAccess ?? 'rear',
    payloadRatio: input.payloadRatio ?? null,
  })
  /**
   * O vão que sobra fica **atrás** da carga com carga leve, e **repartido dos dois lados** com carga
   * pesada — ver `shouldBalanceLoad`.
   */
  /**
   * ⚠️ **Em faixas o vão sobra do lado oposto à primeira entrega, e não antes dela.** A primeira
   * faixa começa em zero porque é a que precisa estar à mão; empurrar o bloco para o fim, como a
   * 099 D2 faz em profundidade, poria justamente ela longe da porta lateral.
   */
  let sliceStartM = lanes ? 0 : balanced ? freeM / 2 : freeM

  for (const slice of slices) {
    /**
     * ⚠️ **A fatia foi empacotada na origem e é transladada aqui.** Empacotar de novo com o `x` já
     * deslocado seria repetir a varredura inteira por nada: o arranjo dentro da fatia não depende de
     * onde a fatia começa. Medido: dimensionar com pacotes descartados e empacotar de novo custava
     * 64 ms numa viagem de 300 notas, contra 5 ms antes da compactação e 50 ms de orçamento.
     */
    for (const box of slice.boxes) {
      /**
       * ⚠️ A destroca é do **par inteiro** — posição e encaixe. Trocar só `x` e `y` deixaria a caixa
       * com a profundidade medida no eixo da largura, e ela atravessaria a parede sem nada falhar.
       */
      /**
       * ⚠️ A profundidade real é **espelhada**: no espaço girado a varredura quebra fileira a partir
       * de `y' = 0`, e sem o espelho isso vira a testeira do baú — a carga nasceria encostada na
       * parede do fundo, que é o oposto do que a 099 D2 conquistou. Espelhando, a primeira fileira
       * de cada faixa encosta na porta.
       */
      rows.push(
        lanes
          ? {
              ...box,
              depthM: box.widthM,
              widthM: box.depthM,
              xM: round(bed.lengthM - box.yM - box.widthM),
              yM: round(sliceStartM + box.xM),
            }
          : { ...box, xM: round(sliceStartM + box.xM) },
      )
    }
    for (const entry of slice.unplaced) pushUnplaced(unplaced, entry)
    for (const box of slice.leftovers)
      leftovers.push({ box, sliceSizeM: slice.lengthM, sliceStartM })
    sliceStartM += slice.lengthM
  }

  rows.push(
    ...placeSplitCargo({
      bed,
      budget: Number.POSITIVE_INFINITY,
      lanes,
      securesCargo: input.securesCargo === true,
      leftovers,
      rows,
      unplaced,
    }),
  )

  /**
   * ⚠️ O motivo é carimbado **aqui**, não dentro da varredura: ele é do arranjo inteiro, e não da
   * caixa. Quem o vê na caixa entende por que ela não está colada na porta como as outras viagens.
   */
  const stamped = balanced
    ? rows.map((row) => ({ ...row, reasons: [...row.reasons, 'weightBalanced' as const] }))
    : rows

  return { layers: toLayers(stamped), source: presumed ? 'estimated' : 'measured', unplaced }
}

/**
 * Empacota a parada crescendo a fatia até ela parar de transbordar — e **devolve o pacote**, não só
 * a medida.
 *
 * ⚠️ **Medir e empacotar são a mesma passagem.** A primeira versão dimensionava com pacotes de teste
 * jogados fora e empacotava de novo no fim: no melhor caso dois pacotes por parada, no pior nove.
 * Guardar o último pacote é de graça, e o arranjo dentro da fatia não depende de onde ela começa —
 * o `x` é transladado depois.
 *
 * ⚠️ Crescer é mais barato que errar para menos: fatia curta transforma carga que cabe em
 * `splitCargo`, que é o aviso que manda o operador desconfiar do desenho.
 */
function packUntilItFits(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  /** Repassados à varredura — ver `packSlice`. */
  readonly securesCargo?: boolean
  readonly stackBeforeRow?: boolean
  readonly openSides?: OpenSides
  readonly boxes: readonly PlacementBox[]
  readonly budget: number
  readonly capM: number
}): {
  readonly boxes: readonly PlacedBox[]
  readonly lengthM: number
  readonly leftovers: readonly PlacementBox[]
  readonly unplaced: readonly UnplacedBox[]
} {
  const crossSectionM2 = input.bed.widthM * input.bed.heightM
  const deepestM = input.boxes.reduce((deepest, box) => {
    const slot = fitSlot({ bed: input.bed, box })
    return slot === null ? deepest : Math.max(deepest, slot.depthM)
  }, 0)
  /**
   * ⚠️ O ponto de partida é o piso volumétrico dividido pela eficiência típica de uma varredura em
   * fileiras — **o único número chutado do arquivo**, de propósito e sem consequência: ele é o
   * palpite inicial de uma busca que confere o resultado, nunca um valor que sai na tela.
   */
  const floorM =
    crossSectionM2 > 0
      ? volumeOf(input.boxes) / crossSectionM2 / ROW_PACKING_EFFICIENCY
      : input.capM
  /**
   * ⚠️ **Em faixas a fatia nasce do tamanho da alocação, e não cresce por etapas.** O crescimento
   * existe para a 099 D1 — a fatia em profundidade mede o que a carga pede, e o que sobra vira vão
   * na testeira. Em faixas o que sobra da largura não vira vão útil: a faixa seguinte só começa
   * antes, e a carga desta paga a diferença **em profundidade**, que é o eixo caro.
   *
   * E há um efeito de segunda ordem que só apareceu medindo: a orientação da caixa é escolhida
   * contra a largura da fatia, então crescer por etapas a decidia contra uma largura provisória
   * menor que a alocada — a caixa entrava deitada e ia uma por fileira onde caberiam duas.
   */
  let lengthM =
    input.stackBeforeRow === true ? input.capM : Math.min(input.capM, Math.max(floorM, deepestM))

  for (let attempt = 0; ; attempt += 1) {
    const packed = packSlice({
      bed: input.bed,
      boxes: input.boxes,
      budget: input.budget,
      sliceLengthM: lengthM,
      ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
      ...(input.stackBeforeRow === undefined ? {} : { stackBeforeRow: input.stackBeforeRow }),
      ...(input.openSides === undefined ? {} : { openSides: input.openSides }),
    })
    const overflowed =
      packed.leftovers.length > 0 || packed.unplaced.some((entry) => entry.reason === 'bedFull')
    const exhausted = attempt + 1 >= SLICE_GROWTH_ATTEMPTS || lengthM >= input.capM - 1e-9
    if (!overflowed || exhausted) return { ...packed, lengthM }

    lengthM = Math.min(input.capM, lengthM * SLICE_GROWTH_FACTOR)
  }
}

/**
 * Quantas vezes a altura da pilha pode passar da menor dimensão da base antes de ela tombar.
 *
 * ⚠️ **Constante operacional declarada, não medida** — como o tempo parado por entrega. A pilha tomba
 * quando a inclinação equivalente passa de `tan⁻¹(base ÷ altura)`: a 3:1 isso é 18,4°, ou **0,33 g**,
 * que cobre frenagem normal e curva forte. Frenagem de emergência passa disso, e nenhuma razão
 * praticável cobre os 0,6 g dela sem esvaziar o baú.
 *
 * ⚠️ **A massa não entra, e isso é física, não simplificação.** Ela cancela nos dois lados da
 * condição de tombamento — coluna pesada e leve de mesma forma tombam no mesmo ângulo —, e cancela
 * também no deslizamento. O peso importaria pela **distribuição** (caixa pesada em cima sobe o centro
 * de massa) e pelo **esmagamento**, que é o que `max_stack_count` declara. Medido nesta base:
 * `gross_weight_grams` existe em **4 de 663** caixas, então uma regra de peso não rodaria em 99,4%
 * das cargas — a lacuna que a ADR-0044 §5 proíbe.
 *
 * ⚠️ Medido em 2:1: a altura útil cai para menos da metade do baú, a carga deixa de caber em faixas,
 * o arranjo volta a profundidade e a última parada vai a **1,66 m** — pior acesso que antes da spec,
 * em nome de uma segurança que a viagem não usa.
 */
export const STABLE_STACK_SLENDERNESS = 3

/** Quantas vezes a fatia cresce antes de desistir e usar o teto proporcional. */
const SLICE_GROWTH_ATTEMPTS = 8
/** O passo do crescimento. Grosso de propósito: o desenho não melhora com precisão de centímetro. */
const SLICE_GROWTH_FACTOR = 1.35
/** A fração da seção que uma varredura em fileiras costuma alcançar. Palpite inicial da busca. */
const ROW_PACKING_EFFICIENCY = 0.7

/**
 * Até onde a mão de quem descarrega chega à frente do corpo, de pé no piso (spec 118).
 *
 * ⚠️ **Constante operacional declarada, não medida** — como a esbeltez. A entrega mais cedo pode subir em
 * cima de uma mais tardia (spec 114 D4), mas só até onde se pega a caixa sem subir na carga: medido nas
 * quatro viagens de 2026-09-10, sem este teto 490 caixas do Atego e 65 da Daily ficavam em cima das
 * entregas seguintes, fundo demais para a mão — a entrega 1 da Daily a 0,91 m da porta e 1,26 m do chão.
 */
export const DELIVERY_REACH_M = 0.6

/**
 * O corredor mais estreito em que uma pessoa entra de lado para buscar a carga do fundo (spec 118).
 *
 * ⚠️ É a largura mínima da faixa da grade: esvaziada a primeira entrega da faixa, é por ela que se anda
 * até a seguinte. Medido na Sprinter de 1,78 m, três faixas davam 0,59 m.
 */
export const ACCESS_CORRIDOR_M = 0.6

/**
 * Quais bordas laterais da fatia **não** são parede — a faixa da grade encosta na vizinha, e a vizinha
 * sai antes (spec 118).
 */
type OpenSides = Readonly<{ columnEnd: boolean; columnStart: boolean }>

const CLOSED_SIDES: OpenSides = { columnEnd: false, columnStart: false }

/**
 * A partir de quanto do teto de massa a carga deixa de encostar na porta.
 *
 * ⚠️ **Não é limite legal por eixo, e não pretende ser.** Carga por eixo pede entre-eixos, posição
 * do eixo sob o baú e a tara distribuída — nada disso está na ficha, e calcular sem eles produziria
 * um número plausível e falso, que é o modo de falha que esta base recusa por escrito. O que dá
 * para afirmar sem inventar dado é **posição longitudinal**: massa pendurada na traseira alivia o
 * eixo dianteiro e sobrecarrega o traseiro, e isso vale sem saber onde os eixos estão exatamente.
 *
 * ⚠️ Por isso `axleNotChecked` **continua** no vocabulário: equilibrar ao longo do comprimento não
 * é conferir eixo, e trocar um pelo outro faria a tela prometer uma conferência que não houve.
 */
const BALANCE_PAYLOAD_RATIO = 0.5

/**
 * Metade do teto é o ponto de virada, e ele é um degrau, não uma rampa.
 *
 * Abaixo dele a descarga manda: a carga encosta na porta, sai pela ordem de entrega e a massa é
 * leve o bastante para o desequilíbrio caber na tolerância do veículo. Acima, a física manda — o
 * bloco vai para o meio do baú, mesmo custando alcance na primeira entrega.
 *
 * ⚠️ Degrau, e não interpolação, porque o operador precisa **prever** o desenho: "acima da metade a
 * carga vai para o meio" se explica e se confere; uma posição que desliza a cada caixa acrescentada
 * não se confere contra nada. A ordem entre paradas não muda em nenhum dos dois lados do degrau.
 *
 * ⚠️ Teto desconhecido é `null`, e `null` **não equilibra**: sem denominador não há proporção, e
 * mover a carga por um palpite seria a invenção que a ausência do teto deveria impedir.
 */
function shouldBalanceLoad(input: {
  readonly loadingAccess: LoadingAccess
  readonly payloadRatio: string | null
}): boolean {
  /**
   * ⚠️ **Carroceria aberta ou sider equilibra sempre, sem olhar o peso.** Encostar na porta serve
   * para alcançar a carga, e num veículo que abre o comprimento inteiro não existe "a porta" a que
   * encostar — toda a carga já está à mão. O vocabulário de `LOADING_ACCESS_KINDS` diz isso na
   * própria definição de `open`: _"a ordem quase não importa; o que passa a valer é o peso"_.
   */
  if (input.loadingAccess === 'open') return true
  if (input.payloadRatio === null) return false
  const ratio = Number(input.payloadRatio)

  return Number.isFinite(ratio) && ratio > BALANCE_PAYLOAD_RATIO
}

/**
 * Em que eixo as paradas se dividem (spec 100 D2).
 *
 * `depth` é a fatia de sempre: a parada 1 na porta, a 2 atrás dela, a 3 atrás da 2. `lanes` põe cada
 * parada numa faixa ao longo da **largura**, e aí todas tocam a porta.
 *
 * ⚠️ **O arranjo em profundidade só funciona enquanto nada foge da ordem.** Cliente fechado, recusa
 * de mercadoria, endereço trocado ou entrega remarcada por telefone são o caso normal, e em qualquer
 * um deles a carga da parada seguinte está atrás de uma parede de caixas que não vão sair ali.
 * Medido na viagem que gerou a spec (Fiorino de 1,70 m, três paradas): **duas das três** não eram
 * alcançáveis pela porta, e as três caberiam lado a lado.
 *
 * ⚠️ Esta função decide, e **não posiciona**. Onde cada caixa pousa é do empacotador; misturar as
 * duas responsabilidades faria a decisão depender do resultado que ela mesma determina.
 */
/**
 * ⚠️ Os dois nomes são do **eixo**, nunca da qualidade do arranjo: `lanes` não é "melhor" e `depth`
 * não é "pior". Qual dos dois vale sai de `resolveStopArrangement`, e a tela imprime qual foi.
 */
export const STOP_ARRANGEMENTS = ['depth', 'grid', 'lanes'] as const
export type StopArrangement = (typeof STOP_ARRANGEMENTS)[number]

/**
 * Por que este arranjo, e não o outro.
 *
 * ⚠️ Ele existe porque **a tela precisa explicar a troca, e não pode deduzi-la**. Deduzir "foi o
 * peso" de `depth` mais carga pesada afirmava isso também quando a viagem tem uma parada só, quando
 * a carroceria é aberta e quando as faixas não caberiam de todo jeito — e nesses três o operador
 * conclui que aliviar a carga devolveria as faixas, e não devolve.
 */
export const STOP_ARRANGEMENT_REASONS = [
  'fits',
  'noBed',
  'openBody',
  'singleStop',
  'tooWide',
  'volumeDoesNotFit',
  'weight',
] as const
export type StopArrangementReason = (typeof STOP_ARRANGEMENT_REASONS)[number]

export type StopArrangementDecision = Readonly<{
  arrangement: StopArrangement
  /**
   * Spec 115: as faixas da grade que a decisão empacotou — ausente fora da grade. Quem desenha usa
   * este número, e não recalcula: recalcular devolveria a maior grade, que é a que deixava caixa fora.
   */
  laneCount?: number
  reason: StopArrangementReason
}>

export function resolveStopArrangement(input: {
  readonly bed: CargoBedDimensions | null
  readonly boxes: readonly PlacementBox[]
  /** Ausente assume `rear`, o mais restritivo — e é ele quem mais ganha com a faixa. */
  readonly loadingAccess?: LoadingAccess
  /** O mesmo `cargoWeight.payloadRatio` que o painel imprime. `null` é teto desconhecido. */
  readonly payloadRatio: string | null
  /** Repassado à comparação da grade com a profundidade — a amarração muda quanto cada uma empilha. */
  readonly securesCargo?: boolean
}): StopArrangementDecision {
  if (input.bed === null) return { arrangement: 'depth', reason: 'noBed' }
  const bedInput = input.bed
  /**
   * ⚠️ **Carroceria aberta não ganha faixa**, pela mesma razão que ela equilibra sempre (099 D3):
   * quem abre o comprimento inteiro já tem toda a carga à mão, e não existe "a porta" a que
   * encostar. Faixa ali não resolveria acesso nenhum e desfaria o equilíbrio de peso.
   */
  if (input.loadingAccess === 'open') return { arrangement: 'depth', reason: 'openBody' }

  const bedWidthM = Number.parseFloat(input.bed.widthM)
  const bedLengthM = Number.parseFloat(input.bed.lengthM)
  const bedHeightM = Number.parseFloat(input.bed.heightM)
  if (
    !Number.isFinite(bedWidthM) ||
    bedWidthM <= 0 ||
    !Number.isFinite(bedLengthM) ||
    bedLengthM <= 0 ||
    !Number.isFinite(bedHeightM) ||
    bedHeightM <= 0
  ) {
    return { arrangement: 'depth', reason: 'noBed' }
  }

  /**
   * ⚠️ **A física vence o acesso** (spec 099 D3, mantida). Massa concentrada numa faixa junto da
   * porta alivia o eixo dianteiro do mesmo jeito que a carga colada na traseira, e faixa não é
   * motivo para desfazer física. Teto desconhecido **não** afirma peso: sem denominador nada se
   * afirma, que é a mesma regra da 099.
   */
  const ratio = input.payloadRatio === null ? null : Number(input.payloadRatio)
  if (ratio !== null && Number.isFinite(ratio) && ratio > BALANCE_PAYLOAD_RATIO) {
    /**
     * ⚠️ **Spec 113: acima de metade do teto a grade ainda serve.** A faixa de uma parada só encosta
     * a carga toda na porta, e é isso que a física recusa. Na grade cada faixa é empacotada em
     * profundidade e **equilibra dentro dela** (`shouldBalanceLoad`), então o peso fica espalhado no
     * comprimento como na profundidade — e as primeiras entregas continuam lado a lado.
     */
    return gridOrDepth({ ...input, bed: bedInput, reason: 'weight' })
  }

  /** Caixa sem medida já não entra no desenho (spec 085): deixá-la pesar aqui derrubaria a viagem. */
  const measured = input.boxes.filter(
    (box) => (box.heightMm ?? 0) > 0 && (box.lengthMm ?? 0) > 0 && (box.widthMm ?? 0) > 0,
  )
  const sequences = [...new Set(measured.map((box) => box.stopSequence))]
  /** Com uma parada os dois arranjos desenham o mesmo — nomear os dois seria distinção sem diferença. */
  if (sequences.length < 2) return { arrangement: 'depth', reason: 'singleStop' }

  const byStop = sequences.map((stopSequence) => {
    const own = measured.filter((box) => box.stopSequence === stopSequence)

    return {
      minWidthM: minimumLaneWidthOf(own),
      /**
       * ⚠️ **A altura útil não é a do baú.** A esbeltez limita a pilha, e uma caixa de 0,30 m com
       * base de 0,30 m só sobe 0,60 m num baú de 1,30 m — menos da metade. Medir o cabimento pela
       * altura do baú prometia faixa que a varredura não entrega, e a carga voltava a sair como
       * `bedFull`.
       */
      usableHeightM: Math.min(bedHeightM, usableStackHeightOf(own)),
      volumeM3: volumeOf(own),
    }
  })

  /**
   * ⚠️ **A faixa não precisa ser proporcional ao volume — ela vai do chão ao teto e da porta à
   * testeira.** O que a parada exige da largura é caber a caixa mais larga dela; a profundidade e a
   * altura resolvem o resto.
   *
   * Medir o cabimento pela fatia proporcional era o defeito que a evidência da spec pegou: na viagem
   * real da crítica a parada menor levava 19% do volume, ganhava 0,28 m de faixa e tinha caixa de
   * 0,30 m — a feature não disparava justamente no caso que a motivou.
   */
  const neededM = byStop.reduce((total, stop) => total + stop.minWidthM, 0)
  if (neededM > bedWidthM) {
    return gridOrDepth({ ...input, bed: bedInput, reason: 'tooWide' })
  }

  /**
   * ⚠️ **Caber em largura não é caber.** A largura mínima é o que a parada exige para a caixa entrar;
   * o volume dela ainda precisa caber na faixa que sobrar. Sem este segundo teste, duas paradas de
   * uma caixa cada seguravam 0,60 m de um baú de 1,45 m e estrangulavam a parada dominante — medido,
   * 15 de 57 caixas saíam como `bedFull` num baú 64% cheio, e as mesmas 57 cabiam em profundidade.
   *
   * O desconto é o **mesmo** `ROW_PACKING_EFFICIENCY` que dimensiona a fatia: nenhuma arrumação real
   * atinge 100% da seção, e comparar com o volume geométrico prometeria uma faixa que a varredura
   * não entrega.
   */
  const totalVolumeM3 = byStop.reduce((total, stop) => total + stop.volumeM3, 0)
  const slackM = bedWidthM - neededM
  const fits = byStop.every((stop) => {
    const share = totalVolumeM3 > 0 ? stop.volumeM3 / totalVolumeM3 : 1 / byStop.length
    const laneWidthM = stop.minWidthM + slackM * share

    return stop.volumeM3 <= laneWidthM * bedLengthM * stop.usableHeightM * ROW_PACKING_EFFICIENCY
  })

  /**
   * ⚠️ **Sem exceção silenciosa**: as faixas cabem todas ou nenhuma. Metade da carga em faixas e
   * metade em profundidade produziria um desenho que ninguém consegue seguir — e o operador seguiria
   * mesmo assim.
   */
  return fits
    ? { arrangement: 'lanes', reason: 'fits' }
    : gridOrDepth({ ...input, bed: bedInput, reason: 'volumeDoesNotFit' })
}

/**
 * Até que altura a carga desta parada sobe sem tombar — o melhor caso entre as caixas dela, porque a
 * varredura escolhe a orientação e põe a de maior pegada por baixo.
 */
function usableStackHeightOf(boxes: readonly PlacementBox[]): number {
  return Math.max(
    ...boxes.map(
      (box) =>
        (Math.min(box.lengthMm ?? 0, box.widthMm ?? 0) / MILLIMETRES_PER_METRE) *
        STABLE_STACK_SLENDERNESS,
    ),
  )
}

/** A largura mínima da faixa: caber a caixa mais larga da parada, girada se for o caso. */
function minimumLaneWidthOf(boxes: readonly PlacementBox[]): number {
  return Math.max(
    ...boxes.map((box) => Math.min(box.lengthMm ?? 0, box.widthMm ?? 0) / MILLIMETRES_PER_METRE),
  )
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
  /** Spec 100: o motorista declarou que amarra a carga — ver `stableStackHeightM`. */
  readonly securesCargo?: boolean
  /**
   * Empilhar antes de avançar a fileira (spec 100).
   *
   * ⚠️ **Depende do que a fileira gasta.** Em profundidade a fileira corre pela **largura** do baú,
   * que é de graça: avançá-la não afasta ninguém da porta, e encher o chão primeiro é o certo. Em
   * faixas a fileira corre pela **profundidade real** — cada fileira nova empurra a carga um passo
   * para dentro —, e ali a ordem se inverte: sobe-se até o teto antes de andar para o fundo.
   *
   * Medido na viagem real, faixa de 0,40 m com 6 caixas de 0,30 m num baú de 1,30 m de altura:
   * cinco caixas deitadas no chão marchando até **1,50 m** da porta e uma só empilhada, quando as
   * seis cabem em **0,60 m** usando as quatro camadas que o baú tem.
   */
  readonly stackBeforeRow?: boolean
  /** Spec 114: a última entrega primeiro — ela vai para o fundo e para baixo. */
  readonly deliveryOrder?: boolean
  /** Por onde a carga sai; ausente segue o arranjo (`lineStart` em faixas, `columnEnd` em fatia). */
  readonly openFace?: OpenFace
  /** Spec 118: as bordas laterais que são outra faixa, e não parede. */
  readonly openSides?: OpenSides
  /**
   * Spec 120: a caixa que o mapa recomendado recusa tenta, **na hora**, o lugar fundo demais para a mão —
   * ver `placeComplement`. Só no bloco por ordem de entrega.
   */
  readonly complement?: boolean
  readonly boxes: readonly PlacementBox[]
  readonly budget: number
  readonly sliceLengthM: number
}): {
  readonly boxes: readonly PlacedBox[]
  /** Spec 134: quanto o bloco pode andar sem soltar a escora da testeira — ver `createSupportMap`. */
  readonly headboardSlackM: number
  readonly leftovers: readonly PlacementBox[]
  /**
   * Spec 120: cada caixa que saiu `bedFull` ou virou sobra, uma por unidade — é a fila do complemento.
   * O `unplaced` guarda só rótulo e contagem, e com isso não se coloca caixa nenhuma.
   */
  readonly overflow: readonly PlacementBox[]
  readonly unplaced: readonly UnplacedBox[]
} {
  const slice = { ...input.bed, lengthM: input.sliceLengthM }
  const unplaced: UnplacedBox[] = []
  const placed: PlacedBox[] = []
  const leftovers: PlacementBox[] = []
  const overflow: PlacementBox[] = []
  /** A sobra é candidata a dividir; quem não pode empilhar não sobe em nada e não é candidata. */
  const spill = (box: PlacementBox): void => {
    overflow.push({ ...box, count: 1 })
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
  const deepAxis = input.stackBeforeRow === true ? 'width' : 'depth'
  const deadSpace = createDeadSpaceTracker({ boxes: input.boxes, deepAxis, slice })
  /**
   * ⚠️ **Spec 130: a caixa pequena entra depois das grandes da própria entrega.** Antes delas, o único
   * topo que ela acha é o das entregas posteriores, onde a entrega dela ainda vai crescer; depois delas,
   * acha o topo da própria pilha. A 118 mediu adiar sozinho e recusou — conserta um cubo a cada cinco
   * paradas e estoura um a cada dez (109 contra 80) —; junto do assento ao alcance mais alto
   * (`createDeadSpaceTracker`), as três densidades caem: 217/185/79 → 100/53/46.
   */
  const smallLast = new Map(
    input.boxes.map((box) => {
      const slot = fitSlot({ bed: slice, box, deepAxis })
      return [box, slot !== null && deadSpace.isSmall(slot) ? 1 : 0] as const
    }),
  )
  const rankSmallLast = (box: PlacementBox): number => smallLast.get(box) ?? 0
  const ordered = [...input.boxes].sort(
    (first, second) =>
      (input.deliveryOrder === true ? second.stopSequence - first.stopSequence : 0) ||
      rankTopOnly(first) - rankTopOnly(second) ||
      rankSmallLast(first) - rankSmallLast(second) ||
      rankPresumed(first) - rankPresumed(second) ||
      footprintOf(second) - footprintOf(first),
  )

  const support = createSupportMap(
    { heightM: slice.heightM, lengthM: slice.lengthM, widthM: slice.widthM },
    input.openFace ?? (input.stackBeforeRow === true ? 'lineStart' : 'columnEnd'),
    input.openSides ?? CLOSED_SIDES,
  )
  let cursor = { layer: 0, layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }
  /**
   * Até onde as fileiras podem ir hoje. Com `stackBeforeRow` ela começa fechada e **só cresce quando
   * a altura acaba** — é o que faz a carga subir junto da porta em vez de se deitar até o fundo.
   * Sem ele a fronteira é a fatia inteira desde o começo, que é o comportamento de sempre.
   */
  let rowFrontierM = input.stackBeforeRow === true ? 0 : slice.widthM
  /** Onde as fileiras já colocadas terminam, em ordem — ver `findNextEdge`. */
  const rowEnds: number[] = []
  /**
   * ⚠️ **O formato que acabou de falhar falha de novo enquanto nada entrar.** O mapa de alturas só muda
   * quando uma caixa é colocada, então sem colocação nova não surge lugar novo — e a gêmea da caixa
   * recusada varria o baú inteiro para descobrir isso. Medido: 3600 caixas iguais num baú cheio,
   * 67 ms contra 50 de orçamento.
   */
  const failedAt = new Map<string, number>()
  /**
   * ⚠️ **Spec 116: o teto de tentativas cresce com as fileiras que a fatia tem.** Eram 64 para
   * qualquer baú, e cada fileira visitada gasta uma: num baú de 7,40 m a varredura recomeça da
   * testeira a cada fronteira nova e passa por quase 150 fileiras de célula. A busca desistia antes
   * de chegar ao lugar livre perto da porta, e a memória de formato (`failedAt`) recusava as gêmeas
   * sem procurar — medido no Atego de 85 paradas: 4 buscas esgotadas derrubaram **431** caixas.
   */
  const seatAttempts = Math.max(
    MAX_SEAT_ATTEMPTS,
    SEAT_ATTEMPTS_PER_ROW * Math.ceil(slice.widthM / SEAT_BUDGET_STEP_M),
  )
  /**
   * Spec 120: quem pousa em quem, para o complemento nunca prender uma caixa recomendada da própria
   * entrega embaixo dele.
   */
  const occupancy =
    input.complement === true
      ? createOccupancyGrid({ lengthM: slice.lengthM, widthM: slice.widthM })
      : null
  const record = (entry: PlacedBox, isComplement: boolean): void => {
    placed.push(entry)
    occupancy?.stamp({ box: entry, isComplement })
  }
  /** A última caixa que foi para longe da mão, por formato — ver o uso. */
  const pendingReach = new Map<
    string,
    Readonly<{ at: number; fallback: PlacedBox; rows: readonly number[]; stopSequence: number }>
  >()

  let frozenStop: number | null = null
  for (const box of ordered) {
    const stackLimit = resolveStackLimit(box)
    if (input.deliveryOrder === true && box.stopSequence !== frozenStop) {
      support.freezeLater()
      frozenStop = box.stopSequence
    }

    for (let unit = 0; unit < box.count; unit += 1) {
      const slot = fitSlot({ bed: slice, box, deepAxis })
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
      /**
       * ⚠️ **Procurar lugar é laço, não sequência de guardas.** A versão anterior conferia o apoio
       * uma vez e, recusando, mandava a caixa para `splitCargo` — e como o cursor não avançava,
       * **toda** caixa seguinte recusava no mesmo ponto: as fatias cresciam até o teto e a carga
       * voltava a se espalhar pelo baú. Recusar uma posição tem de significar tentar a próxima.
       */
      let rest: { readonly topM: number; readonly xM: number } | null = null
      const shapeKey = `${slot.depthM}|${slot.widthM}|${slot.heightM}`
      /** Spec 135: a pegada fora do padrão só balança sobre carga — ver `onlyOverLoad` em `seat`. */
      const onlyOverLoad = deadSpace.isOffPattern(slot)
      /**
       * O assento que as duas buscas aceitam — a do espaço morto e a da fileira. Uma regra só: a caixa
       * pequena não ganha exceção nenhuma por ir para cima.
       */
      /**
       * ⚠️ **Spec 120: o primeiro lugar recusado só pela mão fica guardado.** Se a varredura terminar sem
       * lugar recomendado, a caixa vai para ele — é o lugar que a varredura sem a regra da spec 118
       * escolheria, com o mapa só com as entregas `≥ k`. Tentar no fim, com as entregas anteriores já no
       * baú, recuperava 78 das 227 caixas do Atego: a caixa da entrega `k` não pode pousar nem se escorar
       * em quem sai antes dela, e o topo das paredes já estava fechado. Não rouba lugar do recomendado: o
       * que é fundo demais para a entrega `k` é mais fundo ainda para as anteriores, cuja frente de piso
       * fica mais perto da porta.
       */
      let reachFallback: (SeatCandidate & { readonly yM: number }) | null = null
      /** As fileiras em que apareceu lugar recusado só pela mão — a gêmea procura nelas primeiro. */
      const reachRows: number[] = []
      const isStandingAt = (at: { slot: Slot; topM: number; xM: number; yM: number }): boolean =>
        isStandingUp({
          isRestrainedUpTo: (restraintM) =>
            support.isConfined({ ...at, baseM: at.topM, topM: restraintM }),
          securesCargo: input.securesCargo === true,
          slot,
          topM: at.topM,
        })
      /**
       * ⚠️ **As condições baratas vêm antes da esbeltez**, que varre os quatro lados da pegada: a sombra e
       * o alcance são uma leitura cada. O conjunto aceito é o mesmo — só a ordem mudou.
       */
      const acceptSeat =
        (yM: number, shadowChecked = false) =>
        ({ topM, xM }: { readonly topM: number; readonly xM: number }): boolean => {
          const at = { slot, topM, xM, yM }
          if (xM + slot.depthM > slice.lengthM + 1e-9) return false
          if (input.deliveryOrder !== true) {
            /**
             * ⚠️ **A esbeltez é conferida na altura do assento, não no contador de camadas.** O
             * contador é do cursor e zera quando a fronteira avança; o mapa de apoio, não — ele
             * continua empilhando sobre o que já está lá. Medido: com a trava só no contador a carga
             * voltou a subir 1,20 m numa pilha que a regra limitava a 0,60 m.
             *
             * ⚠️ **A esbeltez só rege a coluna livre.** Cercada de carga e parede, a pilha não tem
             * para onde girar — e recusar altura ali empurraria a carga para o fundo do baú sem
             * ganhar segurança nenhuma.
             */
            return isStandingAt(at)
          }
          /**
           * ⚠️ **Spec 115: a entrega mais cedo não senta atrás de uma mais tardia mais alta que a base
           * dela.** Subir para uma fileira do fundo é legítimo — é o bloco se enchendo —, mas se entre
           * ela e a porta houver carga de parada posterior acima do assento, ela só sai tirando essa
           * carga primeiro. Medido: 1 par em RTC-4H67 e 1 em RTD-5J78, 4 cm de sobreposição com caixas
           * de 20 e 21 cm de altura.
           */
          /** Onde `seat` já recusou a sombra (`rejectShadowed`), ela não é conferida de novo. */
          if (!shadowChecked && support.isShadowed(at)) return false
          if (!support.isOutOfReach(at)) return isStandingAt(at)
          if (occupancy === null) return false
          /** Longe da mão: não é lugar recomendado, mas pode ser o do complemento (`reachFallback`). */
          if (reachRows.at(-1) !== yM) reachRows.push(yM)
          if (
            reachFallback === null &&
            occupancy.isRestable({ ...at, stopSequence: box.stopSequence }) &&
            isStandingAt(at)
          ) {
            reachFallback = { topM, xM, yM }
          }
          return false
        }
      const placeAt = (
        seat: SeatCandidate & { readonly yM: number },
        isComplement: boolean,
      ): PlacedBox => {
        const entry: PlacedBox = {
          depthM: round(slot.depthM),
          documentId: box.documentId ?? null,
          documentNumber: box.documentNumber ?? null,
          heightM: round(slot.heightM),
          isFragile: box.isFragile === true,
          label: box.label,
          layer: cursor.layer,
          reasons: isComplement ? [...resolveReasons(box), 'outOfReach'] : resolveReasons(box),
          source: box.source,
          stopSequence: box.stopSequence,
          widthM: round(slot.widthM),
          xM: round(seat.xM),
          yM: round(seat.yM),
          zM: round(seat.topM),
        }
        record(entry, isComplement)
        support.stamp({ slot, topM: seat.topM + slot.heightM, xM: seat.xM, yM: seat.yM })
        deadSpace.noteStamp(seat.topM + slot.heightM)
        return entry
      }
      const firstSeatIn = (
        rows: readonly number[],
        accept: (yM: number) => (candidate: SeatCandidate) => boolean,
      ): (SeatCandidate & { readonly yM: number }) | null => {
        for (const yM of rows) {
          if (yM + slot.widthM > slice.widthM + 1e-9) continue
          const found = support.seat({
            accept: accept(yM),
            heightM: slice.heightM,
            onlyOverLoad,
            rejectShadowed: input.deliveryOrder === true,
            slot,
            xM: 0,
            yM,
          })
          if (found !== null) return { ...found, yM }
        }
        return null
      }

      /**
       * ⚠️ **Spec 120: a gêmea da caixa que foi para longe da mão não varre o baú de novo.** O mapa só
       * mudou pela caixa que acabou de entrar: lugar recomendado novo só pode nascer em volta dela (topo
       * dela, ou a vizinha que ela passou a escorar), e lugar fundo novo, também ali ou nas fileiras onde a
       * varredura anterior já tinha achado um. Medido no Atego de 1417 caixas: refazer a varredura inteira
       * a cada caixa custava 18 ms dos 50 do orçamento.
       */
      const pending = occupancy === null ? undefined : pendingReach.get(shapeKey)
      if (
        pending !== undefined &&
        pending.at === placed.length &&
        pending.stopSequence === box.stopSequence
      ) {
        const nearRows = rowsAround({ around: pending.fallback, slice, slot, support })
        const nearSeat = firstSeatIn(nearRows, (yM) => acceptSeat(yM, true))
        if (nearSeat !== null) {
          placeAt(nearSeat, false)
          continue
        }
        const rows = [...new Set([...pending.rows, ...nearRows])].sort(
          (first, second) => first - second,
        )
        const reachSeat = firstSeatIn(rows, (yM) => ({ topM, xM }) => {
          const at = { slot, topM, xM, yM }
          return (
            xM + slot.depthM <= slice.lengthM + 1e-9 &&
            !support.isShadowed(at) &&
            support.isOutOfReach(at) &&
            occupancy?.isRestable({ ...at, stopSequence: box.stopSequence }) === true &&
            isStandingAt(at)
          )
        })
        if (reachSeat !== null) {
          const entry = placeAt(reachSeat, true)
          pendingReach.set(shapeKey, {
            at: placed.length,
            fallback: entry,
            rows,
            stopSequence: box.stopSequence,
          })
          continue
        }
      }

      const dead = deadSpace.find({
        accept: acceptSeat,
        frontierM: rowFrontierM,
        onlyOverLoad,
        slot,
        support,
      })
      if (dead !== null) {
        record(
          {
            depthM: round(slot.depthM),
            heightM: round(slot.heightM),
            isFragile: box.isFragile === true,
            label: box.label,
            layer: cursor.layer,
            reasons: resolveReasons(box),
            source: box.source,
            stopSequence: box.stopSequence,
            documentId: box.documentId ?? null,
            documentNumber: box.documentNumber ?? null,
            widthM: round(slot.widthM),
            xM: round(dead.xM),
            yM: round(dead.yM),
            zM: round(dead.topM),
          },
          false,
        )
        support.stamp({ slot, topM: dead.topM + slot.heightM, xM: dead.xM, yM: dead.yM })
        deadSpace.noteStamp(dead.topM + slot.heightM)
        continue
      }
      let guard = failedAt.get(shapeKey) === placed.length ? seatAttempts : 0
      /**
       * ⚠️ **Uma camada varrida inteira sem lugar encerra a busca.** Sem isto o cursor subia de
       * camada indefinidamente — o limite de pilha é infinito para caixa empilhável — e cada caixa
       * pagava as 64 tentativas antes de virar sobra. Medido: 58 buscas por caixa e 10,8 milhões de
       * leituras de perfil, num orçamento de tela de 50 ms.
       */
      let barrenLayers = 0
      /** A primeira caixa abre a fronteira; ela nunca encolhe, e nunca passa da fatia. */
      if (rowFrontierM < slot.widthM) {
        rowFrontierM = Math.min(slice.widthM, slot.widthM)
      }

      while (guard < seatAttempts) {
        guard += 1
        if (cursor.yM + slot.widthM > rowFrontierM + 1e-9) {
          barrenLayers += 1
          if (barrenLayers >= 2) {
            /**
             * ⚠️ **A altura desta faixa acabou — só então a carga anda para o fundo.** Sem este
             * passo a fronteira travava e a caixa virava sobra com o baú vazio na frente dela; com
             * ele, a faixa seguinte recomeça do chão, e é aí que a carga avança um passo.
             */
            if (rowFrontierM >= slice.widthM - 1e-9) break

            rowFrontierM = Math.min(slice.widthM, rowFrontierM + slot.widthM)
            barrenLayers = 0
            cursor = { layer: 0, layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }
            continue
          }
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
          /**
           * ⚠️ **Atingir o teto da pilha é razão para andar para o fundo, não para desistir.** Com a
           * esbeltez limitando a altura, este passa a ser o caminho comum em faixas: sem ele a carga
           * virava `bedFull` com o baú vazio à frente dela — medido, 23 de 31 caixas.
           */
          if (input.stackBeforeRow !== true || rowFrontierM >= slice.widthM - 1e-9) break

          rowFrontierM = Math.min(slice.widthM, rowFrontierM + slot.widthM)
          barrenLayers = 0
          cursor = { layer: 0, layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }
          continue
        }

        const rowYM = cursor.yM
        /**
         * ⚠️ **Recusar um assento é tentar o próximo da mesma fileira, não abandonar a fileira.** As
         * três recusas abaixo eram conferidas depois de `seat` devolver o **primeiro** lugar nivelado:
         * se ele era alto demais, a fileira inteira era pulada — com lugar bom mais adiante nela. Com
         * tamanhos misturados o primeiro lugar nivelado costuma ser o topo de uma pilha solta, e a
         * carga saía `bedFull` com o baú a 38% (spec 115).
         */
        /**
         * ⚠️ **Longe da mão, com o lugar do complemento já guardado e a fileira já anotada, `acceptSeat`
         * recusa sem fazer nada** — e a base apoiada, que é a conta cara, era feita antes dela. Medido no
         * Atego: 57 mil dos 81 mil assentos que chegavam a `acceptSeat` eram esse caso.
         */
        const rejectEarly =
          input.deliveryOrder === true
            ? (xM: number): boolean =>
                (occupancy === null ||
                  ((reachFallback as SeatCandidate | null) !== null &&
                    reachRows.at(-1) === rowYM)) &&
                support.isOutOfReach({ slot, topM: 0, xM, yM: rowYM })
            : undefined
        const found = support.seat({
          accept: acceptSeat(rowYM, true),
          heightM: slice.heightM,
          ...(rejectEarly === undefined ? {} : { rejectEarly }),
          onlyOverLoad,
          rejectShadowed: input.deliveryOrder === true,
          slot,
          xM: cursor.xM,
          yM: cursor.yM,
        })
        if (found !== null) {
          cursor = { ...cursor, xM: found.xM }
          rest = found
          break
        }
        /**
         * Nada nivelado desta fileira em diante: quebra para a fileira ao lado.
         *
         * ⚠️ **A fileira seguinte começa na próxima borda de carga, se ela vier antes do passo.** Andar
         * sempre o tamanho da caixa só testa múltiplos dela: uma peça de 3 m atrás de 3,2 m de carga
         * era tentada em 3 m — esbarrando nos 20 cm finais — e em 6 m, fora do baú, e saía `bedFull`
         * com 4,2 m livres (spec 114). É o mesmo salto para a próxima quina que `seat` faz no outro
         * eixo.
         */
        const stepEndM = cursor.yM + Math.max(cursor.rowWidthM, slot.widthM)
        const nextEdgeM = findNextEdge(rowEnds, cursor.yM)
        cursor = {
          ...cursor,
          rowWidthM: 0,
          xM: 0,
          yM: toMillimetreEdge(nextEdgeM === null ? stepEndM : Math.min(stepEndM, nextEdgeM)),
        }
      }

      if (rest === null) {
        failedAt.set(shapeKey, placed.length)
        /** Atribuído dentro do `accept`: o fluxo de controle do TypeScript não enxerga, daí o `as`. */
        const fallback = reachFallback as (SeatCandidate & { readonly yM: number }) | null
        if (fallback !== null) {
          const entry = placeAt(fallback, true)
          pendingReach.set(shapeKey, {
            at: placed.length,
            fallback: entry,
            rows: [...reachRows],
            stopSequence: box.stopSequence,
          })
          continue
        }
        if (cursor.layer >= stackLimit) {
          overflow.push({ ...box, count: 1 })
          pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
          continue
        }
        spill(box)
        continue
      }

      record(
        {
          depthM: round(slot.depthM),
          heightM: round(slot.heightM),
          isFragile: box.isFragile === true,
          label: box.label,
          layer: cursor.layer,
          reasons: resolveReasons(box),
          source: box.source,
          stopSequence: box.stopSequence,
          documentId: box.documentId ?? null,
          documentNumber: box.documentNumber ?? null,
          widthM: round(slot.widthM),
          xM: round(cursor.xM),
          yM: round(cursor.yM),
          zM: round(rest.topM),
        },
        false,
      )
      support.stamp({ slot, topM: rest.topM + slot.heightM, xM: cursor.xM, yM: cursor.yM })
      deadSpace.noteStamp(rest.topM + slot.heightM)
      insertEdge(rowEnds, toMillimetreEdge(cursor.yM + slot.widthM))
      cursor = {
        ...cursor,
        layerHeightM: Math.max(cursor.layerHeightM, slot.heightM),
        rowWidthM: Math.max(cursor.rowWidthM, slot.widthM),
        xM: cursor.xM + slot.depthM,
      }
    }
  }

  return {
    boxes: placed,
    headboardSlackM: support.headboardSlackM(),
    leftovers,
    overflow,
    unplaced,
  }
}

/**
 * As fileiras em que a caixa `slot` pode ter ganho lugar por causa de `around`: em cima dela, ou a
 * vizinha que ela passou a escorar — até o vão que ainda segura o giro da pilha (`braceGapOf`).
 */
function rowsAround(input: {
  readonly around: PlacedBox
  readonly slice: Readonly<{ widthM: number }>
  readonly slot: Slot
  readonly support: SupportMap
}): readonly number[] {
  const reachM = braceGapOf(input.slot)
  /** Spec 132: as bordas reais em volta dela, dos dois lados — ver `SupportMap.rows`. */
  return input.support.rows({
    fromM: input.around.yM - input.slot.widthM - reachM,
    toM: Math.min(input.slice.widthM, input.around.yM + input.around.widthM + reachM),
    widthM: input.slot.widthM,
  })
}

/**
 * Guarda a borda em ordem, sem repetir. ⚠️ Lista ordenada e busca binária, e não varrer as caixas
 * colocadas: a varredura a cada fileira recusada dobrava o tempo de uma viagem de 300 notas (100 ms
 * contra 50 de orçamento).
 */
function insertEdge(edges: number[], edgeM: number): void {
  let low = 0
  let high = edges.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((edges[middle] ?? 0) < edgeM) low = middle + 1
    else high = middle
  }
  if (edges[low] !== edgeM) edges.splice(low, 0, edgeM)
}

/** A primeira borda depois de `fromM`, ou `null` quando não há carga à frente. */
function findNextEdge(edges: readonly number[], fromM: number): null | number {
  let low = 0
  let high = edges.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((edges[middle] ?? 0) <= fromM + 1e-9) low = middle + 1
    else high = middle
  }
  return edges[low] ?? null
}

/**
 * Quantas fileiras uma caixa tenta antes de virar sobra. O laço já termina sozinho — sem lugar
 * nivelado ele sobe de camada até o teto ou o limite de pilha —, e o teto existe para o caso
 * patológico não custar a tela.
 */
const MAX_SEAT_ATTEMPTS = 64

/** Fileiras que cada caixa pode visitar, por passo de orçamento da fatia — ver `seatAttempts`. */
const SEAT_ATTEMPTS_PER_ROW = 4

/**
 * O passo de **orçamento** da busca de lugar, em metros — não é geometria (spec 132).
 *
 * ⚠️ Ele só diz quantas tentativas a caixa ganha por metro de fatia: é o mesmo teto que a spec 116
 * mediu com a célula de 5 cm, e mantê-lo impede que a troca de geometria mude, de carona, quando a
 * busca desiste. Posição e pegada de caixa não passam por ele.
 */
const SEAT_BUDGET_STEP_M = 0.05

/**
 * Qual borda da fatia é a **face aberta** — o lado por onde a carga sai.
 *
 * ⚠️ **A porta não é parede.** As três paredes do baú e o teto seguram a carga; a porta se abre, e é
 * exatamente nesse instante que a pilha encostada nela cai — em cima de quem abriu. Contar a porta
 * como apoio autorizava pilha alta na única face que não segura nada.
 *
 * ⚠️ A face muda com o arranjo, porque a varredura muda de eixo: em faixas as fileiras crescem da
 * porta para dentro (`lineStart`), e em profundidade o bloco termina na porta (`columnEnd`).
 */
type OpenFace = 'columnEnd' | 'lineEnd' | 'lineStart'

/** Um dos quatro lados da pegada, na conferência da contenção — ver `isConfined`. */
type BraceSide = Readonly<{ forward: boolean; holds: boolean; isColumn: boolean }>

/** Os intervalos de coluna e de linha por pegada, guardados até a grade ganhar borda nova. */
function createSpanMemo(grid: EdgeGrid): {
  readonly clear: () => void
  readonly columns: (fromM: number, sizeM: number) => readonly [number, number]
  readonly lines: (fromM: number, sizeM: number) => readonly [number, number]
} {
  const columns = new Map<number, Map<number, readonly [number, number]>>()
  const lines = new Map<number, Map<number, readonly [number, number]>>()
  const lookup = (
    memo: Map<number, Map<number, readonly [number, number]>>,
    resolve: (fromM: number, sizeM: number) => readonly [number, number],
    fromM: number,
    sizeM: number,
  ): readonly [number, number] => {
    let bySize = memo.get(fromM)
    if (bySize === undefined) {
      bySize = new Map()
      memo.set(fromM, bySize)
    }
    let span = bySize.get(sizeM)
    if (span === undefined) {
      span = resolve(fromM, sizeM)
      bySize.set(sizeM, span)
    }
    return span
  }

  return {
    clear: () => {
      columns.clear()
      lines.clear()
    },
    columns: (fromM, sizeM) => lookup(columns, grid.columnsOf, fromM, sizeM),
    lines: (fromM, sizeM) => lookup(lines, grid.linesOf, fromM, sizeM),
  }
}

/**
 * O relevo da fatia: a altura do topo em cada célula do piso.
 *
 * A varredura em fileiras decide **x** e **y**; quem decide **z** é este mapa, e é por isso que ele
 * existe. Sem ele a caixa herda o topo da camada — o máximo do baú inteiro naquele índice — e o que
 * sai é caixa no ar.
 *
 * ⚠️ **Spec 132: as células nascem das bordas das caixas** (`createEdgeGrid`). A grade de 5 cm
 * obrigava a caixa a ocupar células inteiras — a de 0,261 m reservava 0,30 — e a caixa de cima podia
 * pousar sobre a célula que a de baixo ocupava só em parte: medido, 56 caixas do Atego com até 4,9 cm
 * de balanço na medida real. Com as bordas reais, nivelado quer dizer nivelado na medida da caixa.
 */
function createSupportMap(
  bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>,
  openFace: OpenFace,
  openSides: OpenSides = CLOSED_SIDES,
): {
  /**
   * Spec 134: a menor folga entre o giro de uma pilha escorada na testeira e o vão que ela já tem — quanto
   * o bloco ainda pode andar para a porta sem que alguma escora deixe de encostar. Infinita quando
   * nenhuma pilha carimbada precisou da testeira.
   */
  readonly headboardSlackM: () => number
  /** Acrescenta as bordas de uma caixa sem mudar relevo nenhum — os lugares junto dela passam a existir. */
  readonly addEdges: (extent: EdgeExtent) => void
  /** Onde uma caixa de largura `widthM` pode começar em `y`, entre `fromM` e `toM`, em ordem. */
  readonly rows: (input: {
    readonly fromM: number
    readonly toM: number
    readonly widthM: number
  }) => readonly number[]
  readonly seat: (input: {
    /** Recusa de quem chama — a busca segue para o próximo lugar nivelado da fileira. */
    accept?: (candidate: { readonly topM: number; readonly xM: number }) => boolean
    /**
     * Recusar a sombra da carga posterior (`isShadowed`) **aqui dentro**, antes da base apoiada: ela é o
     * maior de uma linha sob as colunas da pegada, e a janela que já dá o assento dá também ela. Quem
     * pede isto não precisa conferir a sombra em `accept`.
     */
    rejectShadowed?: boolean
    /**
     * Recusa que não depende do assento nem do apoio — conferida antes da base apoiada. Só pode dizer
     * "não" onde `accept` diria "não" sem efeito colateral nenhum; o conjunto aceito não muda.
     */
    rejectEarly?: (xM: number) => boolean
    /**
     * Spec 135: fora do piso, nenhuma parte da pegada fica sobre o piso nu — o balanço só passa por cima
     * de carga. Para a pegada fora do padrão (`isOffPattern`): a prateleira dela sobre o piso escondia o
     * vão embaixo, que o relevo conta como cheio, e a fileira seguinte perdia uma coluna inteira.
     */
    onlyOverLoad?: boolean
    heightM: number
    slot: Slot
    xM: number
    yM: number
  }) => { readonly topM: number; readonly xM: number } | null
  /**
   * Congela o relevo das paradas **já carregadas** — as de entrega mais tardia (spec 115). Chamado a
   * cada troca de parada no bloco por ordem de entrega.
   */
  readonly freezeLater: () => void
  /**
   * Se, entre a caixa e a face aberta, há carga de parada mais tardia acima da base dela — carga que
   * teria de sair antes para esta passar.
   */
  readonly isShadowed: (input: { slot: Slot; topM: number; xM: number; yM: number }) => boolean
  readonly stamp: (input: { slot: Slot; topM: number; xM: number; yM: number }) => void
  /**
   * Se a caixa nesta posição está **presa pelos quatro lados** — parede do baú ou carga vizinha tão
   * alta quanto a base dela.
   *
   * ⚠️ **Pilha confinada não tomba, e é isso que a esbeltez sozinha não sabia.** Tombar é rotacionar
   * em torno de uma aresta da base, e uma coluna cercada não tem para onde girar: a vizinha bloqueia
   * antes de o centro de massa passar da aresta. Por isso a trava de esbeltez vale para a coluna
   * **livre** — a da borda da carga —, e não para a do meio do bloco.
   *
   * ⚠️ O critério da vizinha é chegar à **base** da caixa, não ao topo dela. É o que o mapa sabe no
   * instante da colocação — a vizinha de cima ainda não existe —, e é também o que quem carrega usa:
   * não se empilha alto na quina solta da carga.
   */
  readonly isConfined: (input: {
    /** Spec 135: onde a caixa pousa — sem ela a pilha dela embaixo não é reconhecida. */
    baseM?: number
    slot: Slot
    topM: number
    xM: number
    yM: number
  }) => boolean
  /**
   * Se a caixa, sentada fora do piso, fica funda demais para a mão de quem descarrega (spec 118): mais
   * de `DELIVERY_REACH_M` atrás da frente do piso das paradas já carregadas.
   */
  readonly isOutOfReach: (input: { slot: Slot; topM: number; xM: number; yM: number }) => boolean
} {
  const grid = createEdgeGrid({
    cellLayers: 3,
    columnLayers: 2,
    lengthM: bed.lengthM,
    widthM: bed.widthM,
  })
  const { xs, ys } = grid
  /** O topo de cada célula. */
  const topM = grid.cells[0] ?? []
  /**
   * ⚠️ **Spec 142: a pilha de cada célula, de cima para baixo.** O topo sozinho não distingue parede de
   * prateleira: ele pode ser o balanço de uma caixa apoiada em 80% da base (spec 135) que começa acima
   * da caixa escorada, com vão embaixo. A célula guarda o nó da caixa mais alta (mais um; `0` vazia), e
   * cada nó aponta para o de baixo — lista persistente: partir a célula copia o número e as duas
   * metades dividem a cauda. Toda caixa pousa acima de tudo o que já está na pegada, então a pilha
   * cresce só pelo topo e os intervalos descem em ordem.
   */
  const stackHeadOf = grid.cells[2] ?? []
  const nodeBaseM: number[] = []
  const nodeTopM: number[] = []
  const nodeOwner: number[] = []
  const nodeBelow: number[] = []
  /** Quem responde pela escora na célula: a caixa mais alta que começa abaixo do topo da candidata. */
  let alongsideOwner = 0
  const alongsideTopAt = (column: number, line: number): number => {
    let node = stackHeadOf[column]?.[line] ?? 0
    while (node > 0 && (nodeBaseM[node - 1] ?? 0) >= brace.boxTopM - MIN_BRACE_CONTACT_M + 1e-9) {
      node = nodeBelow[node - 1] ?? 0
    }
    alongsideOwner = node > 0 ? (nodeOwner[node - 1] ?? 0) : 0
    return node > 0 ? (nodeTopM[node - 1] ?? 0) : 0
  }
  /** `freezeLater`: o maior topo das paradas já carregadas entre cada célula e a face aberta. */
  const laterFrontM = grid.cells[1] ?? []
  /** Até onde, na direção da face aberta, cada coluna tem caixa no piso — e o congelado das posteriores. */
  const floorEndM = grid.columns[0] ?? []
  const laterFloorEndM = grid.columns[1] ?? []
  const stamped: {
    /** Spec 142: onde a caixa pousa — é o que diz se ela sobe ao lado de quem ela escoraria. */
    readonly baseM: number
    readonly fromXM: number
    readonly fromYM: number
    readonly toXM: number
    readonly toYM: number
  }[] = []
  let headboardSlackM = Number.POSITIVE_INFINITY
  /**
   * A folga de cada posição conferida desde o último carimbo. ⚠️ Só a posição carimbada entra em
   * `headboardSlackM`: o candidato recusado por outra regra também passa pela contenção, e contá-lo
   * prenderia na cabeceira um bloco sem nenhuma pilha escorada de fato.
   */
  const pendingSlackM = new Map<string, number>()
  const positionKey = (xM: number, yM: number): string => `${String(xM)}|${String(yM)}`

  /**
   * Onde a pessoa para, por trecho de caixa (`x|profundidade`) — só muda quando o piso das posteriores
   * é congelado de novo: partir coluna copia valor, e carimbar mexe só no piso desta entrega.
   */
  const standingCache = new Map<number, Map<number, number>>()
  /** A linha de cada face, até a próxima borda nova partir as linhas. */
  const shadowLineByFace = new Map<number, number>()
  /**
   * As colunas e as linhas de cada pegada, até a próxima borda nova: a esbeltez pergunta pela mesma
   * pegada muitas vezes entre dois carimbos (medido no Atego: as duas buscas binárias eram 5%).
   */
  const spanMemo = createSpanMemo(grid)

  /** O mais fundo que o piso das posteriores chega nas colunas que o trecho `[fromM, toM)` toca. */
  const deepestFloorIn = (fromM: number, toM: number): number => {
    let deepestM = 0
    for (let column = grid.columnAt(fromM); column < xs.length - 1; column += 1) {
      if ((xs[column] ?? 0) >= toM - EDGE_TOLERANCE_M) break
      if ((xs[column + 1] ?? 0) <= fromM + EDGE_TOLERANCE_M) continue
      deepestM = Math.max(deepestM, laterFloorEndM[column] ?? 0)
    }
    return deepestM
  }

  /**
   * A face aberta nunca apoia: é por ela que a carga sai, e com ela aberta a pilha cai.
   *
   * ⚠️ **A borda da faixa da grade não é parede** (spec 118). A vizinha segura a pilha só enquanto
   * está lá, e ela sai antes: contá-la como parede era a premissa que a descarga derrubava — 116
   * de 252 caixas sem apoio na Sprinter e 127 de 500 no Accelo.
   */
  const braceSides: Readonly<
    Record<'columnEnd' | 'columnStart' | 'lineEnd' | 'lineStart', BraceSide>
  > = {
    columnEnd: {
      forward: true,
      holds: openFace !== 'columnEnd' && !openSides.columnEnd,
      isColumn: true,
    },
    columnStart: { forward: false, holds: !openSides.columnStart, isColumn: true },
    lineEnd: { forward: true, holds: openFace !== 'lineEnd', isColumn: false },
    lineStart: { forward: false, holds: openFace !== 'lineStart', isColumn: false },
  }
  /**
   * ⚠️ **A conferência em curso mora aqui, e não em cada chamada.** `isConfined` é chamada dezenas de
   * milhares de vezes por cálculo, e montar a cada vez as funções e os objetos dela era um quarto do tempo
   * do Atego. Nada disto sobrevive entre duas chamadas: `isConfined` preenche tudo antes de usar.
   */
  const brace = {
    baseM: undefined as number | undefined,
    /** Spec 142: o topo da candidata — a vizinha só escora se começa abaixo dele. */
    boxTopM: Number.POSITIVE_INFINITY,
    catchGapM: 0,
    fromXM: 0,
    fromYM: 0,
    slackM: Number.POSITIVE_INFINITY,
    toXM: 0,
    toYM: 0,
    topM: 0,
  }
  /**
   * ⚠️ **Spec 134: a testeira escora, e quanto o bloco ainda pode andar é anotado.** Em profundidade o
   * bloco é empacotado encostado nela e deslocado depois; a escora só vale se o vão final — o
   * deslocamento mais o vão que a caixa já tem — continuar mais estreito que o giro da pilha.
   */
  const leansOnHeadboard = (faceM: number): boolean => {
    if (faceM >= brace.catchGapM - 1e-9) return false
    brace.slackM = Math.min(brace.slackM, brace.catchGapM - faceM)
    return true
  }
  /**
   * ⚠️ **Spec 135: a caixa de baixo não escora a de cima pelo lado** — decisão do usuário. A caixa
   * mais larga embaixo da candidata (o degrau) passa da face dela, e no mapa era "carga tão alta
   * quanto a restrição": a pilha se escorava nela mesma. Ela sustenta por baixo; escora é quem
   * encosta na face com altura ao lado. Medido na linha publicada (`ce0a2d08`): 10, 58, 99 e 26
   * caixas das quatro viagens reais escoradas só no próprio degrau.
   */
  const isOwnStack = (height: number, owner: number | undefined): boolean => {
    if (brace.baseM === undefined || height > brace.baseM + 1e-9) return false
    const under = owner === undefined ? undefined : stamped[owner - 1]
    return (
      under !== undefined &&
      under.fromXM < brace.toXM - EDGE_TOLERANCE_M &&
      brace.fromXM < under.toXM - EDGE_TOLERANCE_M &&
      under.fromYM < brace.toYM - EDGE_TOLERANCE_M &&
      brace.fromYM < under.toYM - EDGE_TOLERANCE_M
    )
  }
  /**
   * O primeiro apoio numa direção, andando de célula em célula a partir da face real: a carga tão
   * alta quanto a restrição, ou a parede — atravessando só vão mais estreito que o giro da pilha.
   *
   * ⚠️ A primeira célula pode ser a da própria pegada, quando a face cai no meio dela: o trecho
   * além da face tem a altura em que a caixa pousa, e é carga tão alta quanto a base dela.
   */
  const bracedToward = (side: BraceSide, across: number, faceM: number): boolean => {
    const edges = side.isColumn ? xs : ys
    const count = edges.length - 1
    const wallM = side.forward ? (edges[count] ?? 0) : 0
    let index = side.forward
      ? faceM >= wallM - EDGE_TOLERANCE_M
        ? count
        : side.isColumn
          ? grid.columnAt(faceM + EDGE_TOLERANCE_M)
          : grid.lineAt(faceM + EDGE_TOLERANCE_M)
      : faceM <= EDGE_TOLERANCE_M
        ? -1
        : side.isColumn
          ? grid.columnBefore(faceM)
          : grid.lineBefore(faceM)
    /**
     * ⚠️ **Spec 132: escora mais estreita que a folga de apoio não escora.** A caixa de baixo que
     * passa 1 mm da face da de cima é carga "à altura da restrição" no mapa, e contava como vizinha:
     * medido, 27 caixas do Atego e 6 do Accelo sem apoio na descarga, todas escoradas numa lâmina de
     * 1 mm. Com a célula de 5 cm a menor saliência era a célula, e o defeito não aparecia. É a mesma
     * régua do juiz da descarga (`MIN_BRACE_CONTACT_M`).
     */
    let braceFromM: number | null = null
    for (;;) {
      const outside = index < 0 || index >= count
      const nearM = outside
        ? wallM
        : side.forward
          ? Math.max(edges[index] ?? 0, faceM)
          : Math.min(edges[index + 1] ?? 0, faceM)
      if (braceFromM === null && Math.abs(nearM - faceM) >= brace.catchGapM - 1e-9) return false
      if (outside) {
        return openFace === 'lineEnd' && !side.forward && !side.isColumn
          ? leansOnHeadboard(faceM)
          : side.holds
      }
      const farM = side.forward ? (edges[index + 1] ?? 0) : (edges[index] ?? 0)
      /**
       * ⚠️ **Spec 142: a vizinha escora só se sobe ao lado da candidata** — a regra do juiz da descarga.
       * A dona do topo vale quando começa abaixo do topo da candidata (com a altura mínima de contato);
       * senão ela é prateleira sobre vão, acima da caixa, e quem responde é a altura maciça da célula.
       * Medido em `ccc09130`: 29 de 144 cargas mistas do banco com caixa sem apoio no juiz, todas por
       * isto; no Atego real, a presumida da entrega 54 escorada numa caixa que começava 21 cm acima dela.
       */
      const height = side.isColumn ? alongsideTopAt(index, across) : alongsideTopAt(across, index)
      const owner = alongsideOwner
      if (height >= brace.topM - 1e-9 && !isOwnStack(height, owner)) {
        braceFromM ??= nearM
        if (Math.abs(farM - braceFromM) >= MIN_BRACE_CONTACT_M - EDGE_TOLERANCE_M) return true
      } else {
        braceFromM = null
      }
      index += side.forward ? 1 : -1
    }
  }

  return {
    headboardSlackM: () => headboardSlackM,
    addEdges: (extent) => {
      shadowLineByFace.clear()
      spanMemo.clear()
      grid.splitAt(extent)
    },
    rows: ({ fromM, toM, widthM }) => grid.rowsFor({ fromM, sizeM: widthM, toM }),
    /**
     * O primeiro lugar **nivelado** a partir de `xM`, na faixa daquele `y`.
     *
     * ⚠️ **Nivelado, não "apoiado o bastante".** A alternativa era exigir uma fração da base
     * apoiada — meia base, dois terços — e todo número desses é inventado: ninguém mediu a
     * distribuição de massa dentro da caixa, e é ela que decide se a caixa tomba. Exigir o piso
     * plano sob a pegada inteira dispensa o parâmetro e resolve as duas coisas de uma vez: não sobra
     * balanço, e a caixa encosta na quina de quem já está lá em vez de deixar vão.
     *
     * ⚠️ **Spec 132: os lugares tentados são as bordas, dos dois lados.** A caixa começa numa borda
     * (`b`) ou termina nela (`b − profundidade`) — os pontos extremos do eixo (Crainic, Perboli e
     * Tadei, 2008). Entre dois deles o relevo sob a caixa não muda, então nenhum lugar nivelado fica
     * de fora; a grade de 5 cm tentava o mesmo lugar a cada célula e só achava os múltiplos dela.
     */
    seat: ({ accept, heightM, onlyOverLoad, rejectEarly, rejectShadowed, slot, xM, yM }) => {
      const [fromLine, toLine] = grid.linesOf(yM, slot.widthM)
      /** O maior e o menor topo de cada coluna na faixa da caixa, sob demanda. */
      const bandHigh = new Float64Array(xs.length)
      const bandLow = new Float64Array(xs.length)
      const known = new Uint8Array(xs.length)
      const bandOf = (column: number): void => {
        if (known[column] === 1) return
        const values = topM[column] ?? []
        let highest = 0
        let lowest = Number.POSITIVE_INFINITY
        for (let line = fromLine; line < toLine; line += 1) {
          const value = values[line] ?? 0
          highest = Math.max(highest, value)
          lowest = Math.min(lowest, value)
        }
        bandHigh[column] = highest
        bandLow[column] = lowest === Number.POSITIVE_INFINITY ? 0 : lowest
        known[column] = 1
      }

      /**
       * ⚠️ **Os lugares tentados andam só para a frente**, então as colunas sob a pegada formam uma janela
       * que só avança: o maior e o menor topo saem de duas filas monótonas, e as pontas da janela de
       * dois ponteiros — sem busca binária nem laço sobre a pegada a cada lugar. É a mesma conta de
       * `columnsOf`, em ordem; medido no Atego, a busca e o laço eram um quarto do tempo do cálculo.
       */
      const columnCount = xs.length - 1
      const faceM = yM + slot.widthM
      /** A linha da face do lado da porta, quando a sombra é conferida aqui; `-1` quando não há. */
      const shadowLine =
        rejectShadowed === true && faceM < bed.widthM - EDGE_TOLERANCE_M ? grid.lineAt(faceM) : -1
      const shadows: number[] = []
      let shadowsHead = 0
      const shadowOf = (column: number): number =>
        shadowLine < 0 ? 0 : (laterFrontM[column]?.[shadowLine] ?? 0)
      const highest: number[] = []
      const lowestColumns: number[] = []
      let highestHead = 0
      let lowestHead = 0
      let first = 0
      let edgeEnd = 0
      let pushed = 0
      for (const x of grid.columnStartsFor({ fromM: xM, sizeM: slot.depthM })) {
        while (first + 1 < columnCount && (xs[first + 1] ?? 0) <= x + EDGE_TOLERANCE_M) first += 1
        const toM = x + slot.depthM
        while (edgeEnd < xs.length && (xs[edgeEnd] ?? 0) < toM - EDGE_TOLERANCE_M) edgeEnd += 1
        const end = Math.min(columnCount, Math.max(first + 1, edgeEnd))
        for (; pushed < end; pushed += 1) {
          bandOf(pushed)
          const high = bandHigh[pushed] ?? 0
          const low = bandLow[pushed] ?? 0
          while (
            highest.length > highestHead &&
            (bandHigh[highest[highest.length - 1] ?? 0] ?? 0) <= high
          ) {
            highest.pop()
          }
          highest.push(pushed)
          while (
            lowestColumns.length > lowestHead &&
            (bandLow[lowestColumns[lowestColumns.length - 1] ?? 0] ?? 0) >= low
          ) {
            lowestColumns.pop()
          }
          lowestColumns.push(pushed)
          if (shadowLine >= 0) {
            const shade = shadowOf(pushed)
            while (
              shadows.length > shadowsHead &&
              shadowOf(shadows[shadows.length - 1] ?? 0) <= shade
            ) {
              shadows.pop()
            }
            shadows.push(pushed)
          }
        }
        while ((highest[highestHead] ?? 0) < first) highestHead += 1
        while ((lowestColumns[lowestHead] ?? 0) < first) lowestHead += 1
        while (shadowLine >= 0 && (shadows[shadowsHead] ?? 0) < first) shadowsHead += 1
        /** O `z` é o topo mais alto sob a pegada inteira: a caixa pousa no que está embaixo dela. */
        const level = bandHigh[highest[highestHead] ?? 0] ?? 0
        const lowest = bandLow[lowestColumns[lowestHead] ?? 0] ?? 0
        if (level + slot.heightM > heightM + 1e-9) continue
        if (shadowLine >= 0 && shadowOf(shadows[shadowsHead] ?? 0) > level + 1e-9) continue
        if (rejectEarly !== undefined && rejectEarly(x)) continue
        if (onlyOverLoad === true && level > 1e-9 && lowest <= 1e-9) continue
        /**
         * ⚠️ **Apoiada, na fração dita** (`MIN_SUPPORTED_BASE_FRACTION`): sob a pegada nada passa do
         * assento, e a área que chega a ele é pelo menos a fração mínima da base.
         */
        if (
          lowest < level - 1e-9 &&
          !isBaseSupported({
            columnHigh: bandHigh,
            columnLow: bandLow,
            depthM: slot.depthM,
            grid,
            layer: topM,
            levelM: level,
            minFraction: MIN_SUPPORTED_BASE_FRACTION,
            span: { end, first, fromLine, toLine },
            widthM: slot.widthM,
            xM: x,
            yM,
          })
        ) {
          continue
        }
        const candidate = { topM: level, xM: x }
        if (accept !== undefined && !accept(candidate)) continue

        return candidate
      }

      return null
    },
    freezeLater: () => {
      standingCache.clear()
      for (let column = 0; column < floorEndM.length; column += 1) {
        laterFloorEndM[column] = floorEndM[column] ?? 0
      }
      /** O maior topo daqui até a face aberta, por coluna — uma passagem de trás para a frente. */
      for (let column = 0; column < topM.length; column += 1) {
        const tops = topM[column] ?? []
        const fronts = laterFrontM[column] ?? []
        let highest = 0
        for (let line = tops.length - 1; line >= 0; line -= 1) {
          highest = Math.max(highest, tops[line] ?? 0)
          fronts[line] = highest
        }
      }
    },
    isShadowed: ({ slot, topM: base, xM, yM }) => {
      const faceM = yM + slot.widthM
      if (faceM >= bed.widthM - EDGE_TOLERANCE_M) return false
      /**
       * ⚠️ Uma busca só: a coluna do começo, e dali até a borda do fim — é `columnsOf` sem a segunda
       * busca. A linha da face é guardada até a grade mudar (medido: 13% do cálculo do Atego).
       */
      let line = shadowLineByFace.get(faceM)
      if (line === undefined) {
        line = grid.lineAt(faceM)
        shadowLineByFace.set(faceM, line)
      }
      const toM = xM + slot.depthM - EDGE_TOLERANCE_M
      const columnCount = xs.length - 1
      for (let column = grid.columnAt(xM); column < columnCount; column += 1) {
        if ((laterFrontM[column]?.[line] ?? 0) > base + 1e-9) return true
        if ((xs[column + 1] ?? 0) >= toM) break
      }
      return false
    },
    /**
     * ⚠️ **Quem descarrega fica de pé no piso** (spec 118). Esvaziadas as entregas anteriores, o piso
     * livre termina onde começa a carga das posteriores; a caixa desta entrega que subiu em cima dela só
     * sai se a face dela, do lado da porta, estiver ao alcance da mão a partir dali. No piso ela sempre
     * sai — a pessoa anda à medida que a entrega esvazia.
     */
    /**
     * ⚠️ A pessoa só chega perto onde cabe o corpo dela: a frente é a do trecho de largura
     * `ACCESS_CORRIDOR_M` mais raso que encosta na caixa, nunca a da coluna da própria caixa — num
     * bolso estreito entre cargas posteriores ela para na boca do bolso. Vale também para a caixa no
     * piso, que é quem fica no fundo do bolso.
     *
     * ⚠️ Spec 132: o trecho corre em metro, não em célula. O mais fundo de um trecho só muda quando uma
     * das pontas dele passa por uma borda de coluna, então basta medir o trecho encostado em cada borda
     * — pelos dois lados — e nas duas pontas do intervalo em que ele ainda toca a caixa.
     */
    isOutOfReach: ({ slot, xM, yM }) => {
      /** A chave é o próprio número: montar texto por consulta custava 10% do cálculo do Atego. */
      let byDepth = standingCache.get(xM)
      if (byDepth === undefined) {
        byDepth = new Map<number, number>()
        standingCache.set(xM, byDepth)
      }
      const known = byDepth.get(slot.depthM)
      if (known !== undefined) {
        return (
          known !== Number.POSITIVE_INFINITY && known - (yM + slot.widthM) > DELIVERY_REACH_M + 1e-9
        )
      }
      const corridorM = ACCESS_CORRIDOR_M
      let standingM = Number.POSITIVE_INFINITY
      if (bed.lengthM <= corridorM + EDGE_TOLERANCE_M) {
        standingM = deepestFloorIn(0, bed.lengthM)
      } else {
        /** O trecho tem de tocar a caixa por mais que a tolerância: encostar na quina não é tocar. */
        const touchM = 2 * EDGE_TOLERANCE_M
        const lowM = Math.max(0, xM - corridorM + touchM)
        const highM = Math.min(bed.lengthM - corridorM, xM + slot.depthM - touchM)
        const measure = (startM: number): void => {
          if (startM < lowM - EDGE_TOLERANCE_M || startM > highM + EDGE_TOLERANCE_M) return
          const clampedM = Math.min(highM, Math.max(lowM, startM))
          standingM = Math.min(standingM, deepestFloorIn(clampedM, clampedM + corridorM))
        }
        measure(lowM)
        measure(highM)
        for (let index = grid.columnEdgeFrom(lowM); index < xs.length; index += 1) {
          const edgeM = xs[index] ?? 0
          if (edgeM > highM + corridorM + EDGE_TOLERANCE_M) break
          measure(edgeM)
          measure(edgeM - corridorM)
        }
      }
      byDepth.set(slot.depthM, standingM)
      if (standingM === Number.POSITIVE_INFINITY) return false

      return standingM - (yM + slot.widthM) > DELIVERY_REACH_M + 1e-9
    },
    isConfined: ({ baseM, slot, topM: top, xM, yM }) => {
      const [fromColumn, toColumn] = spanMemo.columns(xM, slot.depthM)
      const [fromLine, toLine] = spanMemo.lines(yM, slot.widthM)
      /**
       * ⚠️ **Spec 116: vão mais estreito que o giro da pilha é apoio.** A pilha tomba girando em torno
       * da aresta de baixo; se a parede ou a carga do outro lado está mais perto do que o topo anda até
       * o centro de massa passar da aresta, ela encosta antes e não cai. Só a célula vizinha contava, e
       * a caixa presumida de 0,261 m deixava 7 cm até a parede lateral do Atego: a fileira inteira subia
       * em pirâmide (8, 8, 8, 7, 7, 7, 6, 6, 6, 5 caixas por camada), com a coluna da parede tratada como
       * solta. O vão é medido da face **real** da caixa. A porta continua não sendo parede: o caminho que
       * chega à face aberta não apoia nada.
       */
      brace.baseM = baseM
      brace.boxTopM = baseM === undefined ? Number.POSITIVE_INFINITY : baseM + slot.heightM
      brace.catchGapM = braceGapOf(slot)
      /** A folga das escoras na testeira desta posição — só vale se ela sair confinada. */
      brace.slackM = Number.POSITIVE_INFINITY
      brace.topM = top
      brace.fromXM = xM
      brace.fromYM = yM
      brace.toXM = xM + slot.depthM
      brace.toYM = yM + slot.widthM
      /**
       * Os quatro lados da pegada inteira. ⚠️ **Sai no primeiro lado solto**: um lado aberto já decide,
       * e varrer o resto custava o orçamento de resposta da tela num baú cheio.
       *
       * ⚠️ **O lado que mais recusa vai primeiro** — todos precisam segurar, então a ordem não muda a
       * resposta, só quanto se anda até ela. Medido no Atego: o lado da testeira para a porta na
       * direção das colunas recusa 20 mil vezes, o oposto 11 mil, os dois das linhas 6 mil e mil.
       */
      for (let line = fromLine; line < toLine; line += 1) {
        if (!bracedToward(braceSides.columnEnd, line, brace.toXM)) return false
      }
      for (let line = fromLine; line < toLine; line += 1) {
        if (!bracedToward(braceSides.columnStart, line, xM)) return false
      }
      for (let column = fromColumn; column < toColumn; column += 1) {
        if (!bracedToward(braceSides.lineEnd, column, brace.toYM)) return false
      }
      for (let column = fromColumn; column < toColumn; column += 1) {
        if (!bracedToward(braceSides.lineStart, column, yM)) return false
      }
      if (brace.slackM !== Number.POSITIVE_INFINITY) {
        const key = positionKey(xM, yM)
        pendingSlackM.set(key, Math.min(pendingSlackM.get(key) ?? brace.slackM, brace.slackM))
      }

      return true
    },
    stamp: ({ slot, topM: top, xM, yM }) => {
      if (pendingSlackM.size > 0) {
        /** Posição sem conferência própria: na dúvida, a menor folga pendente — nunca solta escora. */
        headboardSlackM = Math.min(
          headboardSlackM,
          pendingSlackM.get(positionKey(xM, yM)) ?? Math.min(...pendingSlackM.values()),
        )
        pendingSlackM.clear()
      }
      shadowLineByFace.clear()
      spanMemo.clear()
      grid.splitAt({ depthM: slot.depthM, widthM: slot.widthM, xM, yM })
      const [fromColumn, toColumn] = grid.columnsOf(xM, slot.depthM)
      const [fromLine, toLine] = grid.linesOf(yM, slot.widthM)
      const owner = stamped.length
      const baseM = top - slot.heightM
      stamped.push({
        baseM,
        fromXM: xM,
        fromYM: yM,
        toXM: xM + slot.depthM,
        toYM: yM + slot.widthM,
      })
      const onFloor = baseM <= 1e-9
      for (let column = fromColumn; column < toColumn; column += 1) {
        if (onFloor) floorEndM[column] = Math.max(floorEndM[column] ?? 0, yM + slot.widthM)
        const tops = topM[column] ?? []
        const heads = stackHeadOf[column] ?? []
        for (let line = fromLine; line < toLine; line += 1) {
          tops[line] = Math.max(tops[line] ?? 0, top)
          nodeBaseM.push(baseM)
          nodeTopM.push(top)
          nodeOwner.push(owner + 1)
          nodeBelow.push(heads[line] ?? 0)
          heads[line] = nodeBaseM.length
        }
      }
    },
  }
}

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
  /** Spec 100: com faixas não existe "região das paradas posteriores" para onde empurrar a sobra. */
  readonly lanes: boolean
  readonly securesCargo: boolean
  readonly leftovers: readonly {
    readonly box: PlacementBox
    readonly sliceSizeM: number
    readonly sliceStartM: number
  }[]
  readonly rows: readonly PlacedBox[]
  readonly unplaced: UnplacedBox[]
}): readonly PlacedBox[] {
  /**
   * ⚠️ Spec 132: o mesmo mapa de bordas reais da varredura. A grade de 5 cm aqui ampliava a pegada das
   * duas pontas (`floor` no começo, `ceil` no fim) — conservador contra cruzamento, mas era a caixa
   * reservando mais piso do que mede.
   */
  const grid = createEdgeGrid({
    cellLayers: 2,
    columnLayers: 0,
    lengthM: input.bed.lengthM,
    widthM: input.bed.widthM,
  })
  /** O topo absoluto de cada célula, e a camada de cima dela mais um (`0` é piso livre). */
  const topM = grid.cells[0] ?? []
  const nextLayer = grid.cells[1] ?? []

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
    grid.splitAt(entry)
    const [fromColumn, toColumn] = grid.columnsOf(entry.xM, entry.depthM)
    const [fromLine, toLine] = grid.linesOf(entry.yM, entry.widthM)
    for (let column = fromColumn; column < toColumn; column += 1) {
      const tops = topM[column] ?? []
      const layers = nextLayer[column] ?? []
      for (let line = fromLine; line < toLine; line += 1) {
        tops[line] = Math.max(tops[line] ?? 0, entry.topM)
        layers[line] = Math.max(layers[line] ?? 0, entry.layer + 1)
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
   * ⚠️ **A busca que falhou não se repete para o mesmo formato da mesma parada.** O mapa de alturas só
   * cresce, então o lugar que não existia para uma caixa não passa a existir para a gêmea dela — e é
   * isso que protege o orçamento que antes era um teto de 40 tentativas **para o caminhão inteiro**:
   * esgotado o teto, toda sobra seguinte saía `tooMany`, e paradas inteiras sumiam do desenho como
   * "limite de detalhe" (medido: 44 de 85 paradas num Atego).
   */
  const failed = new Set<string>()

  for (const { box, sliceSizeM, sliceStartM } of queue) {
    if (placed.length >= input.budget) {
      pushUnplaced(input.unplaced, { count: 1, label: box.label, reason: 'tooMany' })
      continue
    }
    const slot = fitSlot({ bed: input.bed, box })
    const shapeKey =
      slot === null
        ? ''
        : `${box.stopSequence}|${slot.depthM}|${slot.widthM}|${slot.heightM}|${sliceStartM}`
    const spot =
      slot === null || failed.has(shapeKey)
        ? null
        : findSplitSpot({
            grid,
            lanes: input.lanes,
            nextLayer,
            securesCargo: input.securesCargo,
            sliceSizeM,
            sliceStartM,
            slot,
            topM,
            bed: input.bed,
          })
    if (slot === null || spot === null) {
      failed.add(shapeKey)
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
      documentId: box.documentId ?? null,
      documentNumber: box.documentNumber ?? null,
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
  readonly grid: EdgeGrid
  readonly lanes: boolean
  readonly nextLayer: readonly (readonly number[])[]
  readonly securesCargo: boolean
  /** A largura da faixa em faixas; o comprimento da fatia em profundidade. */
  readonly sliceSizeM: number
  readonly sliceStartM: number
  readonly slot: Slot
  readonly topM: readonly (readonly number[])[]
}): {
  readonly layer: number
  readonly topM: number
  readonly xM: number
  readonly yM: number
} | null {
  /**
   * ⚠️ **Em faixas a sobra fica na própria faixa** (spec 100 G003). Em profundidade ela sobe para a
   * região das paradas entregues depois, mais fundo no baú: ali nada fica por cima dela e o corredor
   * já está livre quando a vez dela chega. Em faixas essa região não existe — o mesmo movimento
   * poria a sobra **em cima da faixa de outra parada**, que é o que a fatia veio proibir.
   *
   * Então a busca troca de eixo: `y` fica preso à faixa da parada, e `x` varre do fundo para a porta.
   * A sobra vai para a parte da própria carga mais longe da porta, que é a menos acessível — e é
   * dela mesma, então ninguém precisa mexer nela para chegar a outra entrega.
   *
   * ⚠️ **Ela não pode ser descartada de saída.** A versão anterior mandava toda sobra em faixas para
   * `bedFull`, no argumento de que a parada que estoura a própria faixa já encheu o baú. Isso era
   * verdade quando a faixa era proporcional ao volume, e deixou de ser quando o mínimo passou a ser
   * reservado por parada — medido: 15 de 57 caixas descartadas num baú 64% cheio.
   *
   * ⚠️ Spec 132: os lugares tentados são as bordas reais da carga, dos dois lados (`columnStartsFor`,
   * `rowsFor`), no lugar do passo fixo de 20 cm — a sobra pousa em cima do que já está lá, e é na
   * borda do que já está lá que o relevo muda.
   */
  const { grid, slot } = input
  const reachable = grid.columnStartsFor({ fromM: 0, sizeM: slot.depthM })
  const xCandidates = input.lanes
    ? reachable
    : reachable.filter((xM) => xM <= input.sliceStartM - slot.depthM + EDGE_TOLERANCE_M).reverse()
  const yCandidates = input.lanes
    ? grid.rowsFor({
        fromM: input.sliceStartM,
        sizeM: slot.widthM,
        toM: input.sliceStartM + input.sliceSizeM - slot.widthM,
      })
    : grid.rowsFor({ fromM: 0, sizeM: slot.widthM, toM: input.bed.widthM - slot.widthM })

  for (const xM of xCandidates) {
    let best: { layer: number; topM: number; xM: number; yM: number } | null = null
    const [fromColumn, toColumn] = grid.columnsOf(xM, slot.depthM)

    for (const yM of yCandidates) {
      const [fromLine, toLine] = grid.linesOf(yM, slot.widthM)
      let support = 0
      let layer = 0
      for (let column = fromColumn; column < toColumn; column += 1) {
        const tops = input.topM[column] ?? []
        const layers = input.nextLayer[column] ?? []
        for (let line = fromLine; line < toLine; line += 1) {
          support = Math.max(support, tops[line] ?? 0)
          layer = Math.max(layer, layers[line] ?? 0)
        }
      }
      if (support + slot.heightM > input.bed.heightM + 1e-9) continue
      /**
       * ⚠️ A sobra sobe **em cima** do que já está lá, e por isso ela é justamente quem mais arrisca
       * tombar. Sem esta trava a carga dividida furava a esbeltez pelo caminho de trás — medido: uma
       * caixa a 0,90 m numa pilha que a regra limitava a 0,60 m.
       */
      if (support + slot.heightM > stableStackHeightM(slot, input.securesCargo) + 1e-9) {
        continue
      }
      if (best === null || support < best.topM) {
        best = { layer, topM: support, xM, yM }
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
/**
 * **Quantas caixas iguais podem subir uma sobre a outra sem a pilha tombar na estrada.**
 *
 * ⚠️ **Sem `max_stack_count` cadastrado o limite era infinito**, e a varredura subia até o teto do
 * baú. Numa prateleira isso é aceitável; num veículo em movimento não — frenagem, curva e lombada
 * derrubam pilha alta e estreita, e a carga que cai machuca alguém antes de estragar.
 *
 * A trava é a **esbeltez**: a altura da pilha não passa de `STABLE_STACK_SLENDERNESS` vezes a menor
 * dimensão da base. É a regra de bolso de carga não amarrada, e o produto não sabe se há cinta —
 * então assume que não há, que é a leitura conservadora de sempre.
 *
 * ⚠️ **A conta é de altura, não de contagem.** Quatro caixas de 10 cm são 40 cm de pilha e não
 * preocupam ninguém; quatro de 40 cm são 1,60 m e preocupam. Contar caixas trataria as duas igual.
 *
 * ⚠️ `max_stack_count` declarado **não dispensa** a esbeltez, e vice-versa: o campo fala do que a
 * caixa aguenta de peso em cima (esmagamento), e a esbeltez fala de a pilha ficar de pé. São coisas
 * diferentes, e valem as duas — esta função responde pela primeira, e `stableStackHeightM` pela
 * segunda, conferida no assento.
 */
function resolveStackLimit(box: PlacementBox): number {
  if (box.isStackable === false || box.isFragile === true) return 1

  return box.maxStackCount ?? Number.POSITIVE_INFINITY
}

/**
 * Até que altura, do piso, a pilha desta caixa fica de pé.
 *
 * ⚠️ A base usada é a **da própria caixa**, não a da que está embaixo. Numa carga uniforme — o caso
 * comum — as duas são a mesma; numa carga mista a ordenação já põe a maior pegada por baixo, então a
 * caixa de cima tem base menor e a conta erra **para o lado seguro**.
 */
function stableStackHeightM(slot: Slot, securesCargo: boolean): number {
  /**
   * ⚠️ **Com a carga amarrada a esbeltez deixa de reger.** A cinta prende a pilha à carroceria, e o
   * modo de falha passa a ser o esmagamento ou a própria cinta — nenhum dos dois é geometria de
   * tombamento. O teto vira o do baú, que é o comportamento anterior a esta trava.
   */
  if (securesCargo) return Number.POSITIVE_INFINITY

  const baseM = Math.min(slot.depthM, slot.widthM)

  return baseM > 0 ? baseM * STABLE_STACK_SLENDERNESS : Number.POSITIVE_INFINITY
}

/**
 * O vão mais largo que a parede ou a carga vizinha ainda seguram (spec 116).
 *
 * A coluna que tomba é o trecho acima da contenção, e `isStandingUp` só a consulta quando esse trecho
 * passa de três vezes a base — então a altura dela é pelo menos `3b`. Girando em torno da aresta de
 * baixo, o topo anda `h·b/√(h²+b²)` até o centro de massa passar da aresta, e isso cresce com `h`: o
 * pior caso é `h = 3b`, que dá `3b/√10` ≈ 0,95 da base. Vão menor que isso encosta antes de tombar.
 * Nenhum número novo — é a mesma esbeltez do Passo 4, lida do outro lado do vão.
 */
function braceGapOf(slot: Slot): number {
  const baseM = Math.min(slot.depthM, slot.widthM)

  return (baseM * STABLE_STACK_SLENDERNESS) / Math.hypot(STABLE_STACK_SLENDERNESS, 1)
}

type SupportMap = ReturnType<typeof createSupportMap>

type SeatCandidate = { readonly topM: number; readonly xM: number }

/**
 * **A caixa pequena vai para onde a caixa da carga não cabe** (spec 117).
 *
 * ⚠️ Uma caixa medida de 10 cm entrava antes das presumidas da própria parada — a medida precede a
 * pegada (095 G002) — e sentava no meio da fileira. As presumidas seguintes andavam 10 cm para o lado,
 * a chaminé que sobrava tirava o apoio da fileira de trás naquela coluna, e cada camada acima perdia
 * uma caixa: a pirâmide 8, 8, 8, 8, 7, 7, 7, 6, 6 voltava no meio do bloco. Medido no Atego de 85
 * paradas: 65 das 135 caixas fora eram isso, e 17 cubos entre as presumidas das mesmas paradas
 * derrubavam 251 delas.
 *
 * Quem carrega faz o óbvio: a caixa pequena vai **em cima da pilha que já chegou ao teto útil**, na
 * folga que a caixa da carga não usa. É isso que esta busca procura antes da comum — um assento cuja
 * folga até o teto fique menor que a altura da caixa dominante. Nenhuma regra afrouxa: o assento
 * passa pela mesma esbeltez, sombra e fim do baú que a busca comum confere.
 *
 * ⚠️ **Pequena é pegada em classes de 5 cm menor que a da dominante**, não metro: a caixa de
 * 0,36 × 0,26 m cai nas mesmas classes da presumida de 0,371 × 0,261 e é tratada como ela. A classe é
 * só isto — quem é pequena —, e desde a spec 132 nenhuma caixa ocupa a classe: posição e pegada são a
 * medida real. A dominante é a forma com mais caixas na fatia.
 *
 * ⚠️ O mapa só cresce, então a busca que falhou para uma forma falha de novo até algum topo novo entrar
 * na faixa onde espaço morto pode surgir — é a mesma memória de `failedAt`, com a versão do mapa no
 * lugar da contagem de caixas.
 */
type DeadSpaceTracker = {
  readonly find: (search: {
    readonly accept: (yM: number) => (candidate: SeatCandidate) => boolean
    readonly frontierM: number
    readonly onlyOverLoad: boolean
    readonly slot: Slot
    readonly support: SupportMap
  }) => (SeatCandidate & { readonly yM: number }) | null
  /**
   * Se a pegada em células é menor que a da forma dominante, ou fora do padrão dela — ver `rankSmallLast`
   * e `isOffPattern`.
   */
  readonly isSmall: (slot: Slot) => boolean
  /** Se a pegada no plano não é a da forma dominante, em nenhuma das duas medidas — spec 135. */
  readonly isOffPattern: (slot: Slot) => boolean
  readonly noteStamp: (topM: number) => void
}

function createDeadSpaceTracker(input: {
  readonly boxes: readonly PlacementBox[]
  readonly deepAxis: 'depth' | 'width'
  readonly slice: Readonly<{ heightM: number; lengthM: number; widthM: number }>
}): DeadSpaceTracker {
  const dominant = resolveDominantSlot(input)
  const cellAreaOf = (slot: Slot): number => sizeClassOf(slot.depthM) * sizeClassOf(slot.widthM)
  const isOffPattern = (slot: Slot): boolean =>
    dominant !== null &&
    (Math.abs(slot.depthM - dominant.depthM) > EDGE_TOLERANCE_M ||
      Math.abs(slot.widthM - dominant.widthM) > EDGE_TOLERANCE_M)
  /**
   * ⚠️ **Spec 135: a pegada fora do padrão também é "pequena".** Com as bordas reais (spec 132) a caixa
   * de 0,40 × 0,30 no meio das presumidas de 0,371 × 0,261 abria fileira fora de fase: as de trás andavam
   * 3,9 cm, sobrava vão de 0,34 m onde nenhuma presumida cabe, e as pilhas vizinhas perdiam a contenção.
   * A grade de 5 cm escondia isso — as duas viravam 0,40 × 0,30. Medido no Atego sintético de 85 paradas
   * (`dead-space.contract.ts`): 236 caixas fora contra 26 na linha `ce0a2d08`. Depois das grandes da
   * própria entrega e no espaço morto, ela não tira ninguém de fase.
   *
   * ⚠️ Só a que **não é maior** que a dominante: a pegada maior é base (095 G002), e mandá-la para o topo
   * poria a caixa de 0,80 × 0,60 em cima das de 0,30 × 0,30.
   */
  const isSmall = (slot: Slot): boolean =>
    dominant !== null &&
    (cellAreaOf(slot) < cellAreaOf(dominant) ||
      (isOffPattern(slot) && cellAreaOf(slot) <= cellAreaOf(dominant)))
  /**
   * Abaixo desta altura, carimbar não cria espaço morto nem apoio para ele: o assento precisa de topo
   * acima de `H − dominante − caixa`, e o apoio da coluna livre, de vizinha acima de três bases abaixo
   * do topo dela.
   */
  const reachM = input.boxes.reduce((highest, box) => {
    const slot = fitSlot({ bed: input.slice, box, deepAxis: input.deepAxis })
    if (slot === null || !isSmall(slot)) return highest
    return Math.max(highest, slot.heightM + stableStackHeightM(slot, false))
  }, 0)
  const bandFloorM = input.slice.heightM - (dominant?.heightM ?? 0) - reachM
  const failedAt = new Map<string, number>()
  const highestFailedAt = new Map<string, number>()
  let version = 0
  let stamps = 0
  let highestTopM = 0

  type Search = Parameters<DeadSpaceTracker['find']>[0]
  const findInBand = (
    { accept, frontierM, onlyOverLoad, slot, support }: Search,
    dominantSlot: Slot,
  ) => {
    if (highestTopM + slot.heightM <= input.slice.heightM - dominantSlot.heightM + 1e-9) return null
    const key = `${slot.depthM}|${slot.widthM}|${slot.heightM}`
    if (failedAt.get(key) === version) return null

    for (const yM of support.rows({
      fromM: 0,
      toM: frontierM - slot.widthM,
      widthM: slot.widthM,
    })) {
      const acceptRow = accept(yM)
      const found = support.seat({
        accept: (candidate) =>
          input.slice.heightM - (candidate.topM + slot.heightM) < dominantSlot.heightM - 1e-9 &&
          acceptRow(candidate),
        heightM: input.slice.heightM,
        onlyOverLoad,
        slot,
        xM: 0,
        yM,
      })
      if (found !== null) return { ...found, yM }
    }
    failedAt.set(key, version)

    return null
  }
  /**
   * ⚠️ **Spec 130: sem espaço morto ao alcance, o assento ao alcance mais alto.** Com a regra da mão da
   * 118 o espaço morto quase nunca fica ao alcance — medido no Atego de 85 paradas com um cubo a cada
   * cinco: 0 de 17 cubos acharam um, e os 4100 assentos da faixa foram recusados **todos** pela mão. O
   * cubo caía no primeiro lugar nivelado da fileira, no meio de onde a carga ainda ia crescer, e custava
   * 185 presumidas. O topo mais alto ao alcance é o lugar que a carga da entrega menos usaria depois:
   * 185 → 114, e com a caixa pequena depois das grandes (`rankSmallLast`), 53.
   *
   * ⚠️ Nenhuma regra afrouxa: quem aceita continua sendo a mesma `accept` da varredura — alcance, sombra,
   * esbeltez e fim do baú. Empate fica com o **primeiro** achado (mais longe da porta, depois o menor
   * `x`): desempatar pelo mais perto da porta, ou pela parede, devolvia exatamente os 185 de antes.
   */
  const findHighest = ({ accept, frontierM, onlyOverLoad, slot, support }: Search) => {
    const key = `${slot.depthM}|${slot.widthM}|${slot.heightM}`
    if (highestFailedAt.get(key) === stamps) return null
    let best: (SeatCandidate & { readonly yM: number }) | null = null
    /**
     * ⚠️ **Em profundidade a testeira não é parede para a caixa pequena.** O bloco é empacotado encostado
     * nela e depois deslocado para a porta (ou para o meio, com peso): o vão que sobra lá mede a folga do
     * baú, e passa do giro da pilha de base 10 cm (`braceGapOf`, 9,5 cm). Medido: o cubo da última
     * entrega sentado a 0,63 m no topo da própria pilha, escorado só na testeira, ficava sem apoio na
     * descarga com o vão de 0,119 m. A presumida (giro de 0,25 m) não sente o mesmo vão.
     */
    const leansOnHeadboard = (yM: number, topM: number): boolean =>
      input.deepAxis === 'width' &&
      yM < EDGE_TOLERANCE_M &&
      topM + slot.heightM > stableStackHeightM(slot, false) + 1e-9
    for (const yM of support.rows({
      fromM: 0,
      toM: frontierM - slot.widthM,
      widthM: slot.widthM,
    })) {
      const acceptRow = accept(yM)
      support.seat({
        accept: (candidate) => {
          if (leansOnHeadboard(yM, candidate.topM)) return false
          if ((best === null || candidate.topM > best.topM + 1e-9) && acceptRow(candidate)) {
            best = { ...candidate, yM }
          }
          return false
        },
        heightM: input.slice.heightM,
        onlyOverLoad,
        slot,
        xM: 0,
        yM,
      })
    }
    if (best === null) highestFailedAt.set(key, stamps)

    return best as (SeatCandidate & { readonly yM: number }) | null
  }

  return {
    find: (search) => {
      if (dominant === null || !isSmall(search.slot)) return null

      return findInBand(search, dominant) ?? findHighest(search)
    },
    isOffPattern,
    isSmall,
    noteStamp: (topM) => {
      stamps += 1
      highestTopM = Math.max(highestTopM, topM)
      if (topM > bandFloorM + 1e-9) version += 1
    },
  }
}

/**
 * A classe de tamanho de uma medida, em passos de 5 cm — só para dizer quem é **pequena** (spec 117).
 *
 * ⚠️ Spec 132: era a célula do mapa de alturas, e a caixa ocupava a célula inteira. A célula saiu da
 * geometria; a classe ficou para o critério da 117 não mudar de carona — medido lá com ela.
 */
const SIZE_CLASS_M = 0.05

function sizeClassOf(sizeM: number): number {
  return Math.ceil(sizeM / SIZE_CLASS_M - EDGE_TOLERANCE_M)
}

/** A forma com mais caixas na fatia, no encaixe que a varredura usaria. */
function resolveDominantSlot(input: {
  readonly boxes: readonly PlacementBox[]
  readonly deepAxis: 'depth' | 'width'
  readonly slice: Readonly<{ heightM: number; lengthM: number; widthM: number }>
}): Slot | null {
  const totals = new Map<string, { readonly box: PlacementBox; count: number }>()
  for (const box of input.boxes) {
    const key = `${String(box.lengthMm)}|${String(box.widthMm)}|${String(box.heightMm)}`
    const entry = totals.get(key)
    if (entry === undefined) totals.set(key, { box, count: box.count })
    else entry.count += box.count
  }
  const dominant = [...totals.values()].reduce<{ box: PlacementBox; count: number } | null>(
    (best, entry) => (best === null || entry.count > best.count ? entry : best),
    null,
  )

  return dominant === null
    ? null
    : fitSlot({ bed: input.slice, box: dominant.box, deepAxis: input.deepAxis })
}

/**
 * Se a caixa, sentada em `topM`, deixa a pilha de pé.
 *
 * ⚠️ **A alavanca da coluna livre conta de onde a contenção termina, não do piso** (spec 115). Tombar
 * é girar em torno da aresta onde a pilha deixa de ser segurada: se a vizinha a segura até 0,63 m, o
 * que tomba é o trecho acima disso — e é **esse** trecho que não passa de três vezes a base. A regra
 * anterior só conhecia os dois extremos (livre desde o piso, ou presa na base da caixa), e cada
 * fileira podia subir **uma caixa** acima da vizinha do lado da porta: a carga descia em escada por
 * 2,9 m de um baú de 5,32 m (RTD-5J78, 24 paradas), e 49 caixas saíam `bedFull` com o baú a 38%.
 *
 * ⚠️ A porta continua não sendo parede: a face aberta nunca segura nada (`isConfined`), então a
 * fileira encostada nela segue presa aos três vezes a base contados do piso.
 */
function isStandingUp(input: {
  /** Se os quatro lados da pegada estão segurados — parede ou carga — pelo menos até essa altura. */
  readonly isRestrainedUpTo: (restraintM: number) => boolean
  readonly securesCargo: boolean
  readonly slot: Slot
  readonly topM: number
}): boolean {
  const freeHeightM = stableStackHeightM(input.slot, input.securesCargo)
  const stackTopM = input.topM + input.slot.heightM
  if (stackTopM <= freeHeightM + 1e-9) return true

  /** Presa na base, ela não tem para onde girar; presa mais abaixo, só o trecho de cima gira. */
  return input.isRestrainedUpTo(Math.max(0, Math.min(input.topM, stackTopM - freeHeightM)))
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
  /**
   * Qual dos dois eixos horizontais do encaixe corre pela **profundidade real do baú** — o eixo caro,
   * o que afasta a carga da porta. `undefined` mantém o comportamento de sempre: a primeira
   * orientação que couber.
   *
   * ⚠️ Os dois arranjos usam eixos diferentes para a mesma coisa. Em profundidade a varredura marcha
   * em `x`, então o caro é `depthM`; em faixas ela quebra fileira em `y`, e o caro é `widthM` (o `x`
   * ali é a largura da faixa). Sem dizer qual é qual, a escolha otimizaria o eixo errado num dos dois.
   */
  readonly deepAxis?: 'depth' | 'width'
}): Slot | null {
  /** Spec 132: a pegada é a medida em milímetro inteiro — ver `toMillimetreSize`. */
  const lengthM = toMillimetreSize((input.box.lengthMm ?? 0) / MILLIMETRES_PER_METRE)
  const widthM = toMillimetreSize((input.box.widthMm ?? 0) / MILLIMETRES_PER_METRE)
  const heightM = (input.box.heightMm ?? 0) / MILLIMETRES_PER_METRE
  if (heightM > input.bed.heightM) return null

  const orientations: readonly Slot[] = [
    { depthM: lengthM, heightM, widthM },
    { depthM: widthM, heightM, widthM: lengthM },
  ]
  const usable = orientations.filter(
    (slot) => slot.depthM <= input.bed.lengthM && slot.widthM <= input.bed.widthM,
  )
  const first = usable[0]
  if (first === undefined) return null
  if (input.deepAxis === undefined) return first

  /**
   * ⚠️ **Girar a caixa muda quantas cabem por fileira, e é isso que decide a profundidade.** A
   * escolha era a primeira orientação que coubesse; numa faixa de 0,60 m uma caixa de 0,40 × 0,30
   * entrava deitada e ia **uma** por fileira, quando de pé iam duas. Medido na viagem real: 17 caixas
   * alcançavam 1,50 m da porta, e cabem em 1,20 m.
   *
   * O rendimento é **caixas por metro do eixo caro**: quantas entram numa fileira, dividido pelo
   * quanto essa fileira gasta de profundidade. Empate fica com a primeira, que é a orientação de
   * sempre — desempatar por outro critério mudaria desenho sem melhorar nada.
   */
  /**
   * ⚠️ **Spec 118: o rendimento é contado em células, que é como a varredura empacota.** A caixa
   * ocupa células inteiras (spec 114), então 0,261 m vale 0,30 e 0,371 vale 0,40. Pela medida real a
   * presumida ia com 0,371 m ao longo do comprimento no Atego (24,3 contra 23,0 caixas por metro) —
   * em células as duas dão 20 —, e a fileira de 0,40 m punha o terceiro degrau da porta a 0,80 m,
   * fora da mão: medido, 1008 caixas desenhadas contra 1188 com a fileira de 0,30 m.
   */
  const cellSizeOf = (sizeM: number): number => Math.ceil(sizeM / 0.05 - 1e-6) * 0.05
  const acrossOf = (spanM: number, sizeM: number): number =>
    Math.floor((spanM - sizeM + 1e-9) / cellSizeOf(sizeM)) + 1
  const yieldOf = (slot: Slot): number =>
    input.deepAxis === 'width'
      ? acrossOf(input.bed.lengthM, slot.depthM) / cellSizeOf(slot.widthM)
      : acrossOf(input.bed.widthM, slot.widthM) / cellSizeOf(slot.depthM)

  return usable.reduce((best, slot) => (yieldOf(slot) > yieldOf(best) + 1e-9 ? slot : best), first)
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

/** Como a grade reparte a largura: quantas faixas, e em qual delas cada parada viaja. */
export type GridLanes = Readonly<{
  laneCount: number
  laneOf: ReadonlyMap<number, number>
  laneWidthM: number
}>

/**
 * A grade da spec 113: faixas lado a lado, cada uma com uma **fila** de paradas.
 *
 * ⚠️ **Por que ela existe.** A faixa da spec 100 é uma parada por faixa, e é tudo ou nada: com 24
 * paradas num baú de 2,08 m sobrariam 9 cm por faixa. A viagem caía em profundidade, onde cada parada
 * recebe um pedaço do comprimento proporcional ao volume, sem piso — medido em 2026-09-10: pedaços de
 * 4 a 22 cm contra caixas de 25 a 40 cm, e **16 de 24 paradas fora do desenho** com o baú em 50%. Na
 * grade cada faixa tem o comprimento inteiro e só uma parte das paradas.
 *
 * As paradas entram **em rodízio pela ordem de entrega**: as primeiras K — uma por faixa — ficam todas
 * na porta, e se a primeira der problema a segunda está ao lado, não atrás. Sai o maior K em que a
 * caixa mais larga ainda cabe na faixa e o volume de cada faixa cabe nela. ⚠️ Só vale com **mais
 * paradas que faixas**: com uma parada por faixa isto é a faixa da spec 100, que tem regra própria.
 */
export function resolveGridLanes(
  input: Readonly<{
    bedHeightM: number
    bedLengthM: number
    bedWidthM: number
    boxes: readonly PlacementBox[]
    /** Spec 115: não passar de tantas faixas — é como a decisão experimenta grades mais largas. */
    maxLanes?: number
  }>,
): GridLanes | null {
  const measured = input.boxes.filter(
    (box) => (box.heightMm ?? 0) > 0 && (box.lengthMm ?? 0) > 0 && (box.widthMm ?? 0) > 0,
  )
  const sequences = [...new Set(measured.map((box) => box.stopSequence))].sort(
    (first, second) => first - second,
  )
  if (sequences.length < 2) return null
  const widestM = Math.max(
    ...sequences.map((stopSequence) =>
      minimumLaneWidthOf(measured.filter((box) => box.stopSequence === stopSequence)),
    ),
  )
  if (!(widestM > 0)) return null

  const most = Math.min(
    Math.floor(input.bedWidthM / widestM),
    /** Spec 118: esvaziada a primeira entrega, a faixa é o corredor por onde se busca a seguinte. */
    Math.floor(input.bedWidthM / ACCESS_CORRIDOR_M + 1e-9),
    sequences.length - 1,
    input.maxLanes ?? Number.POSITIVE_INFINITY,
  )
  for (let laneCount = most; laneCount >= 2; laneCount -= 1) {
    const laneWidthM = input.bedWidthM / laneCount
    const laneOf = new Map(
      sequences.map((stopSequence, index) => [stopSequence, index % laneCount]),
    )
    const fits = Array.from({ length: laneCount }, (_, lane) => lane).every((lane) => {
      const own = measured.filter((box) => laneOf.get(box.stopSequence) === lane)
      /**
       * ⚠️ **A pilha da grade é confinada**: as paredes da faixa — o baú ou a faixa vizinha — seguram
       * os dois lados, e "pilha confinada não tomba" (`docs/domain/cargo-placement.md`, Passo 4). A
       * altura sem confinamento (três vezes a base) recusava toda grade: 24 paradas de caixas de
       * 30 cm pediam 0,93 m por faixa contra 0,90 m de teto. Quem decide caixa por caixa continua
       * sendo o empacotador de cada faixa.
       */
      return (
        volumeOf(own) <= laneWidthM * input.bedLengthM * input.bedHeightM * ROW_PACKING_EFFICIENCY
      )
    })
    if (fits) return { laneCount, laneOf, laneWidthM }
  }
  return null
}

/**
 * Grade quando ela **coloca pelo menos o que a profundidade coloca**; senão a profundidade de sempre,
 * com o mesmo motivo da recusa das faixas.
 *
 * ⚠️ **O teste de volume sozinho prometia grade que a varredura não entregava.** Três paradas numa
 * Fiorino — duas de uma caixa e uma de trinta — cabiam em volume nas duas faixas, e a grade colocava
 * 28 das 32 caixas que a profundidade colocava. Trocar acesso por caixa fora do desenho é o defeito
 * que a spec 113 veio consertar, então a decisão empacota os dois e compara.
 */
function gridOrDepth(
  input: Readonly<{
    bed: CargoBedDimensions
    boxes: readonly PlacementBox[]
    loadingAccess?: LoadingAccess
    payloadRatio: string | null
    reason: StopArrangementReason
    securesCargo?: boolean
  }>,
): StopArrangementDecision {
  const depth: StopArrangementDecision = { arrangement: 'depth', reason: input.reason }
  const measured = input.boxes.filter(
    (box) => (box.heightMm ?? 0) > 0 && (box.lengthMm ?? 0) > 0 && (box.widthMm ?? 0) > 0,
  )
  const dimensions = {
    bedHeightM: Number.parseFloat(input.bed.heightM),
    bedLengthM: Number.parseFloat(input.bed.lengthM),
    bedWidthM: Number.parseFloat(input.bed.widthM),
    boxes: measured,
  }
  const context = {
    bed: input.bed,
    ...(input.loadingAccess === undefined ? {} : { loadingAccess: input.loadingAccess }),
    payloadRatio: input.payloadRatio,
    ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
  }
  const requested = measured.reduce((total, box) => total + box.count, 0)

  /**
   * ⚠️ **Spec 115: a grade mais estreita que o volume admite não é a que coloca mais.** O rodízio põe
   * uma parada grande e outra pequena na mesma faixa por acaso, e com seis faixas de uma caixa de
   * largura a mais cheia estourava: medido no Accelo de 24 paradas, 494 de 500 caixas com seis
   * faixas, 473 com cinco, 456 com quatro — e 500 de 500 com três. Com menos faixas cada uma soma mais
   * paradas, e o acaso se dilui. Fica a maior grade que coloca tudo; nenhuma colocando, a que coloca
   * mais — o empate fica com a de mais faixas, que é a de mais entregas na porta.
   */
  let best: { readonly laneCount: number; readonly placed: number } | null = null
  for (
    let grid = resolveGridLanes(dimensions);
    grid !== null;
    grid =
      grid.laneCount > 2 ? resolveGridLanes({ ...dimensions, maxLanes: grid.laneCount - 1 }) : null
  ) {
    const placed = countPlaced(
      placeGrid({
        ...context,
        boxes: measured,
        complement: false,
        grid,
        loadingAccess: input.loadingAccess,
        securesCargo: input.securesCargo,
        unplaced: [],
      }),
    )
    if (best === null || placed > best.placed) best = { laneCount: grid.laneCount, placed }
    if (placed >= requested) break
  }
  if (best === null) return depth

  /**
   * Spec 120: a comparação é entre **mapas recomendados** — o complemento não escolhe arranjo, e as
   * caixas dele não entram na conta. A profundidade é empacotada com o complemento, e com as caixas de
   * entrada originais, para que o desenho final reuse este pacote (`lastDepthPacking`) em vez de refazê-lo:
   * medido no Atego de 1417 caixas, empacotar a profundidade duas vezes estourava os 50 ms.
   */
  const depthPlaced = countRecommended(
    placeCargo({ ...context, arrangement: 'depth', boxes: input.boxes }),
  )

  return best.placed >= depthPlaced
    ? { arrangement: 'grid', laneCount: best.laneCount, reason: input.reason }
    : depth
}

function countPlaced(placement: CargoPlacement | null): number {
  return (placement?.layers ?? []).reduce((total, layer) => total + layer.boxes.length, 0)
}

function countRecommended(placement: CargoPlacement | null): number {
  return (placement?.layers ?? []).reduce(
    (total, layer) => total + layer.boxes.filter((box) => !isComplementBox(box)).length,
    0,
  )
}

/**
 * O último pacote em profundidade, pela identidade da entrada (spec 120). `resolveCargoLayout` decide o
 * arranjo e depois desenha com as mesmas caixas: sem isto o bloco inteiro era empacotado duas vezes.
 *
 * ⚠️ A chave é a **identidade** do arranjo de caixas e do baú, mais os escalares: a entrada é imutável
 * (`readonly` de ponta a ponta), e uma entrada nova é sempre outro objeto. Um item só — é a repetição
 * dentro de uma chamada que se quer evitar, não um cache entre requisições.
 */
let lastDepthPacking: {
  readonly bed: CargoBedDimensions
  readonly boxes: readonly PlacementBox[]
  readonly complement: boolean
  readonly loadingAccess: LoadingAccess
  readonly payloadRatio: string | null
  readonly placement: CargoPlacement | null
  readonly securesCargo: boolean
} | null = null

/**
 * **O baú é enchido como um bloco, da testeira para a porta, pela ordem de entrega** (spec 114).
 *
 * A varredura é a das faixas — sobe até o teto antes de avançar —, com o baú girado e **sem espelho**:
 * a última entrega começa na testeira e cada entrega seguinte continua de onde a anterior parou, ao
 * lado ou em cima dela. Assim a mais cedo nunca fica embaixo nem atrás de uma mais tardia, e as pilhas
 * se apoiam umas nas outras em vez de ficarem soltas.
 *
 * ⚠️ O bloco é deslocado **depois** para a porta (099 D2), ou para o meio acima de metade do teto de
 * massa (099 D3) — **nunca além da folga que mantém a escora da testeira** (spec 134, que revê a D2).
 * Empacotar trata a testeira como parede, e a pilha alta da última entrega se escora nela; deslocada
 * além do giro, ela fica solta — medido, 15 caixas na Sprinter e 15 no Accelo reais. Com a testeira
 * escorando, a carga fica encostada na cabeceira (é também a amarração: carga na cabeceira não corre
 * na freada) e o vão sobra do lado da porta; sem pilha escorada nela, a 099 vale como sempre.
 */
function placeDeliveryBlock(input: {
  readonly balanced: boolean
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly boxes: readonly PlacementBox[]
  readonly complement: boolean
  readonly presumed: boolean
  readonly openSides?: OpenSides
  readonly securesCargo: boolean
  readonly unplaced: readonly UnplacedBox[]
}): CargoPlacement {
  const rotated = {
    heightM: input.bed.heightM,
    lengthM: input.bed.widthM,
    widthM: input.bed.lengthM,
  }
  const packed = packSlice({
    bed: rotated,
    boxes: input.boxes,
    budget: Number.POSITIVE_INFINITY,
    complement: input.complement,
    deliveryOrder: true,
    openFace: 'lineEnd',
    ...(input.openSides === undefined ? {} : { openSides: input.openSides }),
    securesCargo: input.securesCargo,
    sliceLengthM: rotated.lengthM,
    stackBeforeRow: true,
  })
  /**
   * Spec 120: o que o mapa recomendado não colocou tenta o espaço livre, afrouxando só conveniência —
   * ver `placeComplement`. Sem fatia não há para onde dividir: o que nem o complemento coloca não
   * coube no baú.
   */
  const complement = input.complement
    ? placeComplement({
        bed: rotated,
        openSides: input.openSides ?? CLOSED_SIDES,
        overflow: packed.overflow,
        placed: packed.boxes,
        securesCargo: input.securesCargo,
      })
    : { boxes: [], headboardSlackM: Number.POSITIVE_INFINITY, rejected: packed.overflow }
  const unplaced: UnplacedBox[] = [
    ...input.unplaced,
    ...packed.unplaced.filter((entry) => entry.reason !== 'bedFull'),
  ]
  for (const box of complement.rejected) {
    pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
  }
  const drawn = [...packed.boxes, ...complement.boxes]

  const blockEndM = drawn.reduce((end, box) => Math.max(end, box.yM + box.widthM), 0)
  const freeM = Math.max(0, input.bed.lengthM - blockEndM)
  /**
   * ⚠️ Arredondado **uma vez**, antes de somar: arredondar `deslocamento + posição` caixa a caixa fazia
   * duas vizinhas encostadas discordarem na terceira casa e se cruzarem 1 mm.
   */
  const shiftM = round(
    Math.min(
      input.balanced ? freeM / 2 : freeM,
      headboardShiftCapOf(Math.min(packed.headboardSlackM, complement.headboardSlackM)),
    ),
  )
  const rows = drawn.map((box) => ({
    ...box,
    depthM: box.widthM,
    reasons: input.balanced ? [...box.reasons, 'weightBalanced' as const] : box.reasons,
    widthM: box.depthM,
    xM: round(shiftM + box.yM),
    yM: round(box.xM),
  }))

  return { layers: toLayers(rows), source: input.presumed ? 'estimated' : 'measured', unplaced }
}

/**
 * Spec 134: **a escora da testeira fica com 1 cm de sobra.** A folga é a conta exata do mapa de apoio;
 * andar até o último milímetro dela deixaria a pilha a um arredondamento de ficar solta.
 */
const HEADBOARD_BRACE_MARGIN_M = 0.01

/** Quanto o bloco pode andar para a porta sem soltar a escora da testeira, em milímetro inteiro. */
function headboardShiftCapOf(headboardSlackM: number): number {
  if (headboardSlackM === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((headboardSlackM - HEADBOARD_BRACE_MARGIN_M) * 1000 + 1e-6) / 1000)
}

/**
 * **O complemento que fura a ordem** (spec 120): o último degrau. O que nem o mapa recomendado nem o
 * lugar fundo demais para a mão (`reachFallback`, tentado na varredura) colocaram entra no espaço livre
 * que sobrou, marcado `needsRehandling`.
 *
 * ⚠️ **Quem sobra no mapa recomendado sobra por conveniência, não por física.** Medido nas quatro viagens
 * de 2026-09-10: a Daily deixava 40 caixas `bedFull` com o baú a 57%, e o Atego 227 a 58% — a décima
 * camada fica funda demais para a mão (spec 118), e só a entrega ao alcance a enchia. "Se tem espaço,
 * a carga entra", pediu o usuário, e o desenho diz que a caixa entrou por fora da recomendação.
 *
 * ⚠️ Roda **na mesma ordem do mapa recomendado** — da última entrega para a primeira —, e é isso que
 * garante a descarga: a caixa da entrega `k` só se apoia e só se escora em caixa que ainda está no baú
 * quando a vez dela chega (entregas `≥ k`), e nunca pousa em cima de caixa da própria entrega do mapa
 * recomendado, que ficaria presa embaixo dela. Ninguém perde apoio por causa dela.
 */
function placeComplement(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly openSides: OpenSides
  readonly overflow: readonly PlacementBox[]
  readonly placed: readonly PlacedBox[]
  readonly securesCargo: boolean
}): {
  readonly boxes: readonly PlacedBox[]
  readonly headboardSlackM: number
  readonly rejected: readonly PlacementBox[]
} {
  if (input.overflow.length === 0) {
    return { boxes: [], headboardSlackM: Number.POSITIVE_INFINITY, rejected: [] }
  }
  const { bed } = input
  const support = createSupportMap(bed, 'lineEnd', input.openSides)
  const occupancy = createOccupancyGrid({ lengthM: bed.lengthM, widthM: bed.widthM })
  const noteBoxes = new Map<string, BoxExtent[]>()
  const noteOf = (documentId: string | null | undefined): BoxExtent[] =>
    documentId === null || documentId === undefined ? [] : (noteBoxes.get(documentId) ?? [])
  const addToNote = (documentId: string | null | undefined, box: BoxExtent): void => {
    if (documentId === null || documentId === undefined) return
    noteBoxes.set(documentId, [...noteOf(documentId), box])
  }
  for (const box of input.placed) {
    /** Spec 132: as bordas de toda a carga viram lugar tentado — o relevo segue só o das posteriores. */
    support.addEdges(box)
    occupancy.stamp({ box, isComplement: false })
    addToNote(box.documentId, box)
  }

  const boxes: PlacedBox[] = []
  const rejected: PlacementBox[] = []
  const sequences = [
    ...new Set([...input.placed, ...input.overflow].map((box) => box.stopSequence)),
  ].sort((first, second) => second - first)
  /** Por entrega, uma vez: filtrar a carga inteira a cada entrega era 2% do cálculo do Atego. */
  const overflowByStop = groupByStop(input.overflow)
  const placedByStop = groupByStop(input.placed)
  for (const stopSequence of sequences) {
    const own = overflowByStop.get(stopSequence) ?? []
    /**
     * O relevo congelado é o das entregas posteriores — as que já estão lá quando esta carrega —, e só
     * serve para dizer se a caixa também passou da mão. Congelar custa o baú inteiro; só onde há fila.
     */
    if (own.length > 0) support.freezeLater()
    for (const box of placedByStop.get(stopSequence) ?? []) support.stamp(toSupportStamp(box))
    if (own.length === 0) continue
    /** O mapa só cresce: o formato que falhou falha de novo enquanto nada entrar (a mesma memória da varredura). */
    const failedAt = new Map<string, number>()

    for (const box of own) {
      const slot = fitSlot({ bed, box, deepAxis: 'width' })
      const seat =
        slot === null
          ? null
          : findComplementSeat({
              bed,
              failedAt,
              note: noteOf(box.documentId),
              noteKey: box.documentId ?? '',
              occupancy,
              securesCargo: input.securesCargo,
              slot,
              stamps: boxes.length,
              stopSequence,
              support,
            })
      if (slot === null || seat === null) {
        rejected.push(box)
        continue
      }
      const placedBox: PlacedBox = {
        depthM: round(slot.depthM),
        documentId: box.documentId ?? null,
        documentNumber: box.documentNumber ?? null,
        heightM: round(slot.heightM),
        isFragile: box.isFragile === true,
        label: box.label,
        layer: Math.round(seat.topM / slot.heightM),
        reasons: [...resolveReasons(box), ...complementReasonsOf(seat)],
        source: box.source,
        stopSequence: box.stopSequence,
        widthM: round(slot.widthM),
        xM: round(seat.xM),
        yM: round(seat.yM),
        zM: round(seat.topM),
      }
      boxes.push(placedBox)
      support.stamp(toSupportStamp(placedBox))
      occupancy.stamp({ box: placedBox, isComplement: true })
      addToNote(box.documentId, placedBox)
    }
  }

  return { boxes, headboardSlackM: support.headboardSlackM(), rejected }
}

/** As caixas de cada entrega, na ordem em que vieram. */
function groupByStop<TBox extends { readonly stopSequence: number }>(
  boxes: readonly TBox[],
): ReadonlyMap<number, readonly TBox[]> {
  const byStop = new Map<number, TBox[]>()
  for (const box of boxes) {
    const list = byStop.get(box.stopSequence)
    if (list === undefined) byStop.set(box.stopSequence, [box])
    else list.push(box)
  }
  return byStop
}

/** O motivo que a caixa carrega: a ordem que ela fura, e o alcance quando ela também passou dele. */
function complementReasonsOf(seat: { readonly outOfReach: boolean }): readonly PlacementReason[] {
  return seat.outOfReach ? ['outOfReach', 'needsRehandling'] : ['needsRehandling']
}

function toSupportStamp(box: PlacedBox): {
  readonly slot: Slot
  readonly topM: number
  readonly xM: number
  readonly yM: number
} {
  return {
    slot: { depthM: box.depthM, heightM: box.heightM, widthM: box.widthM },
    topM: box.zM + box.heightM,
    xM: box.xM,
    yM: box.yM,
  }
}

type ComplementSeat = Readonly<{ outOfReach: boolean; topM: number; xM: number; yM: number }>

/**
 * O lugar do complemento que fura a ordem: primeiro encostado na própria nota, depois o mais perto da
 * porta.
 *
 * ⚠️ **Só a ordem, e não o alcance, é tentada aqui.** O alcance já foi tentado na varredura, na hora
 * certa (`reachFallback`); no fim, com as entregas anteriores no baú, ele não achou lugar nenhum nas
 * quatro viagens medidas — e varrer o baú mais uma vez por caixa custava o orçamento da tela.
 */
function findComplementSeat(input: {
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly failedAt: Map<string, number>
  readonly note: readonly BoxExtent[]
  readonly noteKey: string
  readonly occupancy: OccupancyGrid
  readonly securesCargo: boolean
  readonly slot: Slot
  readonly stamps: number
  readonly stopSequence: number
  readonly support: SupportMap
}): ComplementSeat | null {
  const { slot, support } = input
  const found = scanRelaxedSeat({
    accept:
      (yM) =>
      ({ topM, xM }) => {
        const at = { slot, topM, xM, yM }
        return (
          input.occupancy.isRestable({ ...at, stopSequence: input.stopSequence }) &&
          isStandingUp({
            isRestrainedUpTo: (restraintM) =>
              support.isConfined({ ...at, baseM: at.topM, topM: restraintM }),
            securesCargo: input.securesCargo,
            slot,
            topM,
          })
        )
      },
    bed: input.bed,
    failedAt: input.failedAt,
    note: input.note,
    noteKey: input.noteKey,
    slot,
    support,
    version: input.stamps,
  })

  return found === null
    ? null
    : {
        outOfReach: support.isOutOfReach({ slot, topM: found.topM, xM: found.xM, yM: found.yM }),
        topM: found.topM,
        xM: found.xM,
        yM: found.yM,
      }
}

/**
 * A busca de lugar do complemento, fileira por fileira **da porta para a testeira**, primeiro encostada
 * na própria nota e depois em qualquer lugar.
 *
 * ⚠️ Encostada na nota procura só nas fileiras onde a nota está: fora delas não há contato possível, e
 * varrer o baú inteiro duas vezes por caixa custava o orçamento da tela.
 */
function scanRelaxedSeat(input: {
  readonly accept: (yM: number) => (candidate: SeatCandidate) => boolean
  readonly bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>
  readonly failedAt: Map<string, number>
  readonly note: readonly BoxExtent[]
  readonly noteKey: string
  readonly slot: Slot
  readonly support: SupportMap
  readonly version: number
}): (SeatCandidate & { readonly yM: number }) | null {
  const { slot } = input
  const shapeKey = `${String(slot.depthM)}|${String(slot.widthM)}|${String(slot.heightM)}`
  /** Spec 132: as bordas reais da carga, dos dois lados — ver `SupportMap.rows`. */
  const allRows = input.support.rows({
    fromM: 0,
    toM: input.bed.widthM - slot.widthM,
    widthM: slot.widthM,
  })
  /** Da porta para a testeira: o `y` maior primeiro. */
  const descending = (fromM: number, toM: number): readonly number[] =>
    allRows.filter((yM) => yM >= fromM - EDGE_TOLERANCE_M && yM <= toM + EDGE_TOLERANCE_M).reverse()
  const noteFrom = Math.min(...input.note.map((box) => box.yM))
  const noteTo = Math.max(...input.note.map((box) => box.yM + box.widthM))
  const passes =
    input.note.length > 0
      ? ([
          {
            key: `${input.noteKey}`,
            rows: descending(noteFrom - slot.widthM, noteTo),
            touching: true,
          },
          { key: '', rows: allRows.toReversed(), touching: false },
        ] as const)
      : ([{ key: '', rows: allRows.toReversed(), touching: false }] as const)

  for (const pass of passes) {
    const key = `${pass.key}|${shapeKey}`
    if (input.failedAt.get(key) === input.version) continue
    for (const yM of pass.rows) {
      const acceptRow = input.accept(yM)
      const found = input.support.seat({
        /** O encosto na nota é a conferência barata, e vai antes da esbeltez. */
        accept: (candidate) =>
          candidate.xM + slot.depthM <= input.bed.lengthM + 1e-9 &&
          (!pass.touching ||
            input.note.some((other) =>
              areTouching(toExtent({ slot, topM: candidate.topM, xM: candidate.xM, yM }), other),
            )) &&
          acceptRow(candidate),
        heightM: input.bed.heightM,
        slot,
        xM: 0,
        yM,
      })
      if (found !== null) return { ...found, yM }
    }
    input.failedAt.set(key, input.version)
  }

  return null
}

function toExtent(input: {
  readonly slot: Slot
  readonly topM: number
  readonly xM: number
  readonly yM: number
}): BoxExtent {
  return {
    depthM: input.slot.depthM,
    heightM: input.slot.heightM,
    widthM: input.slot.widthM,
    xM: input.xM,
    yM: input.yM,
    zM: input.topM,
  }
}

type OccupancyGrid = ReturnType<typeof createOccupancyGrid>

/**
 * O baú inteiro, com **todas** as entregas — é ele que diz se o lugar está livre. O mapa de apoio do
 * complemento só enxerga as entregas que ficam no baú até a vez da caixa, e sozinho deixaria a caixa
 * atravessar uma entrega anterior.
 *
 * ⚠️ A pilha é maciça: toda caixa pousa nivelada sobre a pegada inteira, então o topo de cada célula diz
 * tudo o que há embaixo dele.
 */
function createOccupancyGrid(input: { readonly lengthM: number; readonly widthM: number }): {
  readonly isRestable: (at: {
    readonly slot: Slot
    readonly stopSequence: number
    readonly topM: number
    readonly xM: number
    readonly yM: number
  }) => boolean
  readonly stamp: (entry: { readonly box: PlacedBox; readonly isComplement: boolean }) => void
} {
  /** Spec 132: as mesmas bordas reais do mapa de apoio — ver `createEdgeGrid`. */
  const grid = createEdgeGrid({
    cellLayers: 3,
    columnLayers: 0,
    lengthM: input.lengthM,
    widthM: input.widthM,
  })
  const topM = grid.cells[0] ?? []
  const ownerSequence = grid.cells[1] ?? []
  const ownerIsComplement = grid.cells[2] ?? []

  return {
    /**
     * Livre acima do assento e pousado em quem sai **depois**: caixa do complemento da mesma entrega, ou
     * de entrega posterior. Em cima da caixa recomendada da própria entrega ela a prenderia — a de baixo
     * só sai depois dela, e ela é justamente a que a mão não alcança.
     */
    isRestable: ({ slot, stopSequence, topM: base, xM, yM }) => {
      const [fromColumn, toColumn] = grid.columnsOf(xM, slot.depthM)
      const [fromLine, toLine] = grid.linesOf(yM, slot.widthM)
      let lowest = Number.POSITIVE_INFINITY
      for (let column = fromColumn; column < toColumn; column += 1) {
        for (let line = fromLine; line < toLine; line += 1) {
          const top = topM[column]?.[line] ?? 0
          if (top > base + 1e-9) return false
          lowest = Math.min(lowest, top)
          if (base <= 1e-9 || top < base - 1e-9) continue
          if (
            (ownerIsComplement[column]?.[line] ?? 0) !== 1 &&
            (ownerSequence[column]?.[line] ?? 0) <= stopSequence
          ) {
            return false
          }
        }
      }
      /** Spec 135: a mesma base apoiada mínima do assento da varredura. */
      return (
        lowest >= base - 1e-9 ||
        isBaseSupported({
          depthM: slot.depthM,
          grid,
          layer: topM,
          levelM: base,
          minFraction: MIN_SUPPORTED_BASE_FRACTION,
          span: { end: toColumn, first: fromColumn, fromLine, toLine },
          widthM: slot.widthM,
          xM,
          yM,
        })
      )
    },
    stamp: ({ box, isComplement }) => {
      grid.splitAt(box)
      const [fromColumn, toColumn] = grid.columnsOf(box.xM, box.depthM)
      const [fromLine, toLine] = grid.linesOf(box.yM, box.widthM)
      const top = box.zM + box.heightM
      for (let column = fromColumn; column < toColumn; column += 1) {
        const tops = topM[column] ?? []
        const owners = ownerSequence[column] ?? []
        const kinds = ownerIsComplement[column] ?? []
        for (let line = fromLine; line < toLine; line += 1) {
          if (top <= (tops[line] ?? 0) + 1e-9) continue
          tops[line] = top
          owners[line] = box.stopSequence
          kinds[line] = isComplement ? 1 : 0
        }
      }
    },
  }
}

/**
 * A largura que as caixas da faixa **ocupam de verdade**: o maior múltiplo da largura mínima delas.
 *
 * ⚠️ **A sobra da faixa não é piso, é o vão que tira o confinamento.** Com a faixa de 0,347 m e a
 * caixa de 0,30 m, os 4,7 cm de folga deixavam a pilha sem parede de um lado, e a esbeltez a travava
 * em 0,75 m num baú de 2,20 m. Medido: uma faixa a 41% do volume recusava 23 de 56 caixas como
 * `bedFull`. A folga continua no desenho, entre as faixas — é espaço onde nenhuma caixa cabe.
 */
function packedLaneWidthM(boxes: readonly PlacementBox[], laneWidthM: number): number {
  const unitM = minimumLaneWidthOf(boxes)
  if (!(unitM > 0) || unitM >= laneWidthM) return laneWidthM

  return Math.floor(laneWidthM / unitM + 1e-9) * unitM
}

/**
 * Empacota cada faixa da grade como um baú mais estreito, **em profundidade**, e as põe lado a lado.
 *
 * ⚠️ Nenhuma regra nova: dentro da faixa valem todas as do `docs/domain/cargo-placement.md` — pouso,
 * tombamento, fatia do tamanho da carga, a carga encostada na porta ou equilibrada acima de metade do
 * teto. A faixa só muda a largura do baú que cada fila enxerga.
 */
function placeGrid(
  input: Readonly<{
    bed: NonNullable<Parameters<typeof resolveCargoPlacement>[0]['bed']>
    boxes: readonly PlacementBox[]
    /** Spec 120: cada faixa tenta o complemento dentro dela — ver `placeCargo`. */
    complement: boolean
    grid: GridLanes
    loadingAccess: LoadingAccess | undefined
    payloadRatio: string | null | undefined
    securesCargo: boolean | undefined
    unplaced: readonly UnplacedBox[]
  }>,
): CargoPlacement {
  const placed: PlacedBox[] = []
  const unplaced: UnplacedBox[] = [...input.unplaced]
  let estimated = false

  for (let lane = 0; lane < input.grid.laneCount; lane += 1) {
    const own = input.boxes.filter((box) => input.grid.laneOf.get(box.stopSequence) === lane)
    if (own.length === 0) continue
    const packedWidthM = packedLaneWidthM(own, input.grid.laneWidthM)
    const lanePlacement = placeCargo({
      arrangement: 'depth',
      bed: { ...input.bed, widthM: packedWidthM.toFixed(3) },
      boxes: own,
      complement: input.complement,
      /**
       * Só a borda que encosta na parede do baú é parede. A da última faixa, com folga até a parede, é
       * vão — e vão mais largo que o giro da pilha não segura nada.
       */
      openLaneSides: {
        columnEnd: lane < input.grid.laneCount - 1 || packedWidthM < input.grid.laneWidthM - 1e-9,
        columnStart: lane > 0,
      },
      ...(input.loadingAccess === undefined ? {} : { loadingAccess: input.loadingAccess }),
      ...(input.payloadRatio === undefined ? {} : { payloadRatio: input.payloadRatio }),
      ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
    })
    if (lanePlacement === null) continue
    if (lanePlacement.source === 'estimated') estimated = true
    const offsetM = input.grid.laneWidthM * lane
    for (const layer of lanePlacement.layers) {
      for (const box of layer.boxes) placed.push({ ...box, yM: round(box.yM + offsetM) })
    }
    unplaced.push(...lanePlacement.unplaced)
  }

  return { layers: toLayers(placed), source: estimated ? 'estimated' : 'measured', unplaced }
}
