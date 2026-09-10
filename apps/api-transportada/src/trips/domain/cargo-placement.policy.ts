/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
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
  'weightBalanced',
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

  /**
   * Em que eixo as paradas se dividem (spec 100). ⚠️ A **mesma** chamada que `resolveCargoLayout`
   * faz: as duas políticas desenham a mesma viagem, e decidir separado faria a planta mostrar faixas
   * enquanto a tabela descreve profundidade — as duas plausíveis, uma errada, e nada falhando.
   */
  const arrangement =
    input.arrangement ??
    resolveStopArrangement({
      bed: input.bed,
      boxes: input.boxes,
      loadingAccess: input.loadingAccess ?? 'rear',
      payloadRatio: input.payloadRatio ?? null,
      ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
    }).arrangement
  if (arrangement === 'grid') {
    const grid = resolveGridLanes({
      bedHeightM: bed.heightM,
      bedLengthM: bed.lengthM,
      bedWidthM: bed.widthM,
      boxes: measured,
    })
    if (grid !== null) {
      return placeGrid({
        bed: input.bed,
        boxes: measured,
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
  let placedCount = 0

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

  const slices = sequences.map((stopSequence) => {
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
      budget: MAX_PLACED_BOXES,
      capM,
      securesCargo: input.securesCargo === true,
      /** Em faixas a fileira gasta profundidade: sobe-se antes de andar para o fundo (spec 100). */
      stackBeforeRow: lanes,
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
      if (placedCount >= MAX_PLACED_BOXES) {
        pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'tooMany' })
        continue
      }
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
      placedCount += 1
    }
    for (const entry of slice.unplaced) pushUnplaced(unplaced, entry)
    for (const box of slice.leftovers)
      leftovers.push({ box, sliceSizeM: slice.lengthM, sliceStartM })
    sliceStartM += slice.lengthM
  }

  rows.push(
    ...placeSplitCargo({
      bed,
      budget: MAX_PLACED_BOXES - placedCount,
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
  /**
   * ⚠️ **A fatia nunca é mais curta que a caixa mais funda da parada.** A proporção por volume dava a
   * uma parada de três caixas 6% do baú — 0,35 m para uma caixa de 0,40 m —, e nenhuma caixa dela
   * entrava na própria fatia: a parada inteira sumia do desenho como `bedFull` num baú 30% cheio.
   * Em faixas o teto é largura, e o mínimo dela já é a caixa mais larga (`minimumLaneWidthOf`).
   */
  const capM = input.stackBeforeRow === true ? input.capM : Math.max(input.capM, deepestM)
  let lengthM = input.stackBeforeRow === true ? capM : Math.min(capM, Math.max(floorM, deepestM))

  for (let attempt = 0; ; attempt += 1) {
    const packed = packSlice({
      bed: input.bed,
      boxes: input.boxes,
      budget: input.budget,
      sliceLengthM: lengthM,
      ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
      ...(input.stackBeforeRow === undefined ? {} : { stackBeforeRow: input.stackBeforeRow }),
    })
    const overflowed =
      packed.leftovers.length > 0 || packed.unplaced.some((entry) => entry.reason === 'bedFull')
    const exhausted = attempt + 1 >= SLICE_GROWTH_ATTEMPTS || lengthM >= capM - 1e-9
    if (!overflowed || exhausted) return { ...packed, lengthM }

    lengthM = Math.min(capM, lengthM * SLICE_GROWTH_FACTOR)
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
  readonly boxes: readonly PlacementBox[]
  readonly budget: number
  readonly sliceLengthM: number
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

  const support = createSupportMap(
    { heightM: slice.heightM, lengthM: slice.lengthM, widthM: slice.widthM },
    input.stackBeforeRow === true ? 'lineStart' : 'columnEnd',
  )
  let cursor = { layer: 0, layerBottomM: 0, layerHeightM: 0, rowWidthM: 0, xM: 0, yM: 0 }
  /**
   * Até onde as fileiras podem ir hoje. Com `stackBeforeRow` ela começa fechada e **só cresce quando
   * a altura acaba** — é o que faz a carga subir junto da porta em vez de se deitar até o fundo.
   * Sem ele a fronteira é a fatia inteira desde o começo, que é o comportamento de sempre.
   */
  let rowFrontierM = input.stackBeforeRow === true ? 0 : slice.widthM

  for (const box of ordered) {
    const stackLimit = resolveStackLimit(box)

    for (let unit = 0; unit < box.count; unit += 1) {
      const slot = fitSlot({
        bed: slice,
        box,
        deepAxis: input.stackBeforeRow === true ? 'width' : 'depth',
      })
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
      let guard = 0
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

      while (guard < MAX_SEAT_ATTEMPTS) {
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

        const found = support.seat({
          heightM: slice.heightM,
          slot,
          xM: cursor.xM,
          yM: cursor.yM,
        })
        /**
         * ⚠️ **A esbeltez é conferida na altura do assento, não no contador de camadas.** O contador
         * é do cursor e zera quando a fronteira avança; o mapa de apoio, não — ele continua
         * empilhando sobre o que já está lá. Medido: com a trava só no contador a carga voltou a
         * subir 1,20 m numa pilha que a regra limitava a 0,60 m.
         */
        const tooTall =
          found !== null &&
          found.topM + slot.heightM >
            stableStackHeightM(slot, input.securesCargo === true) + 1e-9 &&
          /**
           * ⚠️ **A esbeltez só rege a coluna livre.** Cercada de carga e parede, a pilha não tem para
           * onde girar — e recusar altura ali empurraria a carga para o fundo do baú sem ganhar
           * segurança nenhuma.
           */
          !support.isConfined({ slot, topM: found.topM, xM: found.xM, yM: cursor.yM })
        if (found !== null && !tooTall && found.xM + slot.depthM <= slice.lengthM + 1e-9) {
          cursor = { ...cursor, xM: found.xM }
          rest = found
          break
        }
        /** Nada nivelado desta fileira em diante: quebra para a fileira ao lado. */
        cursor = {
          ...cursor,
          rowWidthM: 0,
          xM: 0,
          yM: cursor.yM + Math.max(cursor.rowWidthM, slot.widthM),
        }
      }

      if (rest === null) {
        if (cursor.layer >= stackLimit) {
          pushUnplaced(unplaced, { count: 1, label: box.label, reason: 'bedFull' })
          continue
        }
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
        xM: round(cursor.xM),
        yM: round(cursor.yM),
        zM: round(rest.topM),
      })
      support.stamp({ slot, topM: rest.topM + slot.heightM, xM: cursor.xM, yM: cursor.yM })
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
 * Quantas fileiras uma caixa tenta antes de virar sobra. O laço já termina sozinho — sem lugar
 * nivelado ele sobe de camada até o teto ou o limite de pilha —, e o teto existe para o caso
 * patológico não custar a tela.
 */
const MAX_SEAT_ATTEMPTS = 64

/**
 * O relevo da fatia: a altura do topo em cada célula do piso.
 *
 * A varredura em fileiras decide **x** e **y**; quem decide **z** é este mapa, e é por isso que ele
 * existe. Sem ele a caixa herda o topo da camada — o máximo do baú inteiro naquele índice — e o que
 * sai é caixa no ar.
 */
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
type OpenFace = 'columnEnd' | 'lineStart'

function createSupportMap(
  bed: Readonly<{ heightM: number; lengthM: number; widthM: number }>,
  openFace: OpenFace,
): {
  readonly seat: (input: {
    heightM: number
    slot: Slot
    xM: number
    yM: number
  }) => { readonly topM: number; readonly xM: number } | null
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
  readonly isConfined: (input: { slot: Slot; topM: number; xM: number; yM: number }) => boolean
} {
  const columns = Math.max(1, Math.ceil(bed.lengthM / HEIGHT_MAP_CELL_M))
  const lines = Math.max(1, Math.ceil(bed.widthM / HEIGHT_MAP_CELL_M))
  const topM = new Float64Array(columns * lines)

  /**
   * ⚠️ **A folga nas duas pontas não é preciosismo — é o que impede a escada.** `0.6 / 0.05` dá
   * `11.999999999999998` em binário, então `floor` devolve 11 e duas caixas encostadas passam a
   * dividir uma célula. Cada uma pousava sobre a anterior, e uma fileira de seis subia degrau a
   * degrau até o teto do baú. Medido: quatro caixas em escada numa fileira de piso.
   */
  /**
   * ⚠️ **As duas pontas arredondam, e é o arredondamento igual que impede a escada.** Com `floor` na
   * base e `ceil` no topo, duas caixas encostadas de 33 cm dividiam a célula da fronteira: cada uma
   * pousava sobre a anterior e a fileira subia degrau a degrau. Arredondando as duas, a fronteira
   * comum cai na mesma célula para as duas caixas, qualquer que seja o tamanho — e o desenho não
   * ganha vão de meia célula entre caixas encostadas.
   */
  const range = (fromM: number, sizeM: number, limit: number): readonly [number, number] => {
    const from = Math.max(0, Math.round(fromM / HEIGHT_MAP_CELL_M))
    return [
      from,
      Math.min(limit, Math.max(from + 1, Math.round((fromM + sizeM) / HEIGHT_MAP_CELL_M))),
    ]
  }

  return {
    /**
     * O primeiro lugar **nivelado** a partir de `xM`, na faixa daquele `y`.
     *
     * ⚠️ **Nivelado, não "apoiado o bastante".** A alternativa era exigir uma fração da base
     * apoiada — meia base, dois terços — e todo número desses é inventado: ninguém mediu a
     * distribuição de massa dentro da caixa, e é ela que decide se a caixa tomba. Exigir o piso
     * plano sob a pegada inteira dispensa o parâmetro e resolve as duas coisas de uma vez: não sobra
     * balanço, e a caixa encosta na quina de quem já está lá em vez de deixar vão.
     *
     * ⚠️ **O salto é para a próxima quina, não de célula em célula.** É a mudança de altura que cria
     * a posição boa; varrer 5 cm por vez custaria o orçamento da tela para chegar no mesmo lugar.
     */
    seat: ({ heightM, slot, xM, yM }) => {
      const [fromLine, toLine] = range(yM, slot.widthM, lines)
      const depth = Math.max(1, Math.round(slot.depthM / HEIGHT_MAP_CELL_M))
      const first = Math.max(0, Math.floor(xM / HEIGHT_MAP_CELL_M + 1e-6))
      const last = columns - depth

      /**
       * O perfil da faixa — o maior e o menor topo de cada coluna dentro do `y` da caixa — calculado
       * **sob demanda**.
       *
       * ⚠️ Montá-lo inteiro antes de procurar custava a tela: são 148 colunas por 50 linhas a cada
       * caixa, multiplicadas pelas tentativas de dimensionamento da fatia. Medido: 130 ms numa viagem
       * de 300 notas, contra o orçamento de 50. O lugar quase sempre aparece nas primeiras colunas.
       */
      const ceilingOf = new Float64Array(columns).fill(-1)
      const floorOf = new Float64Array(columns)
      const bandAt = (column: number): readonly [number, number] => {
        if ((ceilingOf[column] ?? -1) >= 0) return [ceilingOf[column] ?? 0, floorOf[column] ?? 0]
        let highest = 0
        let lowest = Number.POSITIVE_INFINITY
        for (let line = fromLine; line < toLine; line += 1) {
          const value = topM[column * lines + line] ?? 0
          highest = Math.max(highest, value)
          lowest = Math.min(lowest, value)
        }
        ceilingOf[column] = highest
        floorOf[column] = lowest === Number.POSITIVE_INFINITY ? 0 : lowest
        return [highest, floorOf[column] ?? 0]
      }

      /**
       * ⚠️ **Uma passagem só, mantendo a corrida de colunas no mesmo nível.** A versão anterior
       * reconferia, para cada coluna candidata, todas as colunas da pegada — 148 × 24 por caixa, e
       * 900 caixas custavam 83 ms contra o orçamento de 50. A corrida vê cada coluna uma vez.
       */
      let runStart = first
      let level: number | null = null
      for (let column = first; column < columns; column += 1) {
        const [ceiling, floor] = bandAt(column)
        /** Coluna que não é plana no próprio `y` não serve de base: a corrida recomeça depois dela. */
        if (Math.abs(ceiling - floor) > 1e-9) {
          runStart = column + 1
          level = null
          continue
        }
        if (level === null || Math.abs(ceiling - level) > 1e-9) {
          runStart = column
          level = ceiling
        }
        if (column - runStart + 1 < depth) continue
        if (runStart > last) break
        if (level + slot.heightM > heightM + 1e-9) {
          runStart = column + 1
          level = null
          continue
        }

        return { topM: level, xM: runStart * HEIGHT_MAP_CELL_M }
      }

      return null
    },
    isConfined: ({ slot, topM: top, xM, yM }) => {
      const [fromColumn, toColumn] = range(xM, slot.depthM, columns)
      const [fromLine, toLine] = range(yM, slot.widthM, lines)
      /** Encostado na parede é apoio: a parede não sai do lugar. */
      const supportsBefore = (column: number, line: number): boolean => {
        /** A face aberta nunca apoia: é por ela que a carga sai, e com ela aberta a pilha cai. */
        if (openFace === 'lineStart' ? line < 0 : column >= columns) return false
        if (column < 0 || line < 0 || column >= columns || line >= lines) return true

        return (topM[column * lines + line] ?? 0) >= top - 1e-9
      }

      /**
       * Os quatro lados da pegada inteira. ⚠️ **Sai no primeiro vão**: um lado aberto já decide, e
       * varrer o resto custava o orçamento de resposta da tela num baú cheio.
       */
      for (let line = fromLine; line < toLine; line += 1) {
        if (!supportsBefore(fromColumn - 1, line)) return false
        if (!supportsBefore(toColumn, line)) return false
      }
      for (let column = fromColumn; column < toColumn; column += 1) {
        if (!supportsBefore(column, fromLine - 1)) return false
        if (!supportsBefore(column, toLine)) return false
      }

      return true
    },
    stamp: ({ slot, topM: top, xM, yM }) => {
      const [fromColumn, toColumn] = range(xM, slot.depthM, columns)
      const [fromLine, toLine] = range(yM, slot.widthM, lines)
      for (let column = fromColumn; column < toColumn; column += 1) {
        for (let line = fromLine; line < toLine; line += 1) {
          const cell = column * lines + line
          topM[cell] = Math.max(topM[cell] ?? 0, top)
        }
      }
    },
  }
}

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

  for (const { box, sliceSizeM, sliceStartM } of queue) {
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
            lanes: input.lanes,
            lines,
            securesCargo: input.securesCargo,
            sliceSizeM,
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
  readonly lanes: boolean
  readonly lines: number
  /** A largura da faixa em faixas; o comprimento da fatia em profundidade. */
  readonly securesCargo: boolean
  readonly sliceSizeM: number
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
   */
  const firstX = input.lanes ? 0 : input.sliceStartM - input.slot.depthM
  const stepX = input.lanes ? step : -step
  const lastX = input.lanes ? input.bed.lengthM - input.slot.depthM : 0
  const firstY = input.lanes ? input.sliceStartM : 0
  const lastY = input.lanes
    ? input.sliceStartM + input.sliceSizeM - input.slot.widthM
    : input.bed.widthM - input.slot.widthM

  for (let xM = firstX; input.lanes ? xM <= lastX + 1e-9 : xM >= lastX - 1e-9; xM += stepX) {
    let best: { layer: number; topM: number; xM: number; yM: number } | null = null

    for (let yM = firstY; yM <= lastY + 1e-9; yM += step) {
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
      /**
       * ⚠️ A sobra sobe **em cima** do que já está lá, e por isso ela é justamente quem mais arrisca
       * tombar. Sem esta trava a carga dividida furava a esbeltez pelo caminho de trás — medido: uma
       * caixa a 0,90 m numa pilha que a regra limitava a 0,60 m.
       */
      if (
        support + input.slot.heightM >
        stableStackHeightM(input.slot, input.securesCargo) + 1e-9
      ) {
        continue
      }
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
  const lengthM = (input.box.lengthMm ?? 0) / MILLIMETRES_PER_METRE
  const widthM = (input.box.widthMm ?? 0) / MILLIMETRES_PER_METRE
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
  const yieldOf = (slot: Slot): number =>
    input.deepAxis === 'width'
      ? Math.floor((input.bed.lengthM + 1e-9) / slot.depthM) / slot.widthM
      : Math.floor((input.bed.widthM + 1e-9) / slot.widthM) / slot.depthM

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

  const most = Math.min(Math.floor(input.bedWidthM / widestM), sequences.length - 1)
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
  const grid = resolveGridLanes({
    bedHeightM: Number.parseFloat(input.bed.heightM),
    bedLengthM: Number.parseFloat(input.bed.lengthM),
    bedWidthM: Number.parseFloat(input.bed.widthM),
    boxes: measured,
  })
  if (grid === null) return depth

  const context = {
    bed: input.bed,
    ...(input.loadingAccess === undefined ? {} : { loadingAccess: input.loadingAccess }),
    payloadRatio: input.payloadRatio,
    ...(input.securesCargo === undefined ? {} : { securesCargo: input.securesCargo }),
  }
  const gridPlaced = countPlaced(
    placeGrid({
      ...context,
      boxes: measured,
      grid,
      loadingAccess: input.loadingAccess,
      securesCargo: input.securesCargo,
      unplaced: [],
    }),
  )
  const depthPlaced = countPlaced(
    resolveCargoPlacement({ ...context, arrangement: 'depth', boxes: measured }),
  )

  return gridPlaced >= depthPlaced ? { arrangement: 'grid', reason: input.reason } : depth
}

function countPlaced(placement: CargoPlacement | null): number {
  return (placement?.layers ?? []).reduce((total, layer) => total + layer.boxes.length, 0)
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
    const lanePlacement = resolveCargoPlacement({
      arrangement: 'depth',
      bed: { ...input.bed, widthM: packedLaneWidthM(own, input.grid.laneWidthM).toFixed(3) },
      boxes: own,
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
