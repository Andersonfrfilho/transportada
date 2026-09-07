/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import {
  countBoxesToMeasure,
  resolveCargoPlanLayers,
  type CargoPlanBox,
  type CargoPlanLayers,
} from './cargo-plan.policy.js'
import {
  resolveCargoPlacement,
  resolveFallbackBox,
  type CargoPlacement,
  type MeasuredBoxShape,
  type PlacementBox,
} from './cargo-placement.policy.js'
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_CARGO_LAYOUT'
const VOLUME_SCALE = 6n
const SHARE_SCALE = 4n
const SHARE_FACTOR = 10n ** SHARE_SCALE
/** Spec 088: metro com milímetro, que é o que a fita do conferente lê na parede do baú. */
const LENGTH_SCALE = 3n
const LENGTH_FACTOR = 10n ** LENGTH_SCALE
/** O que separa a escala do volume da do metro: `m³ / m² = m`, e as escalas se acertam aqui. */
const VOLUME_TO_LENGTH_FACTOR = 10n ** (VOLUME_SCALE - LENGTH_SCALE)

export type CargoLayoutStop = {
  /**
   * Spec 088 G003: as caixas desta parada, para a faixa contar camadas. Viajam **com a parada** e
   * não num mapa ao lado, porque é o agrupamento por endereço que as reuniu — um segundo mapa
   * chaveado pela sequência precisaria refazer esse agrupamento e poderia discordar dele.
   */
  readonly boxes?: readonly CargoPlanBox[]
  readonly documentsWithoutVolume: number
  readonly label: string
  readonly sequence: number
  readonly volumeM3: string | null
}

/**
 * As três medidas internas do baú, em metros. Spec 088 D2: elas saem da FICHA e de mais lugar
 * nenhum — sem elas não há planta, e a referência de mercado por tipo continua fora.
 */
export type CargoBedDimensions = {
  readonly heightM: string
  readonly lengthM: string
  readonly widthM: string
}

export type CargoLayoutSlice = {
  /**
   * Spec 088 R3: quanto de bau esta faixa ocupa, em metros — `volume / (largura x altura)`, a
   * fatia transversal de verdade. `null` sem a medida do bau, que e o estado de toda a frota hoje:
   * a fileira proporcional da 085 continua, e so o metro some.
   */
  readonly depthM: string | null
  /**
   * A distância da porta até a borda desta faixa que olha para a porta.
   *
   * ⚠️ **Negativa é legítima**: é a carga que não coube e atravessou a porta. Zerar aqui faria o
   * desenho afirmar que tudo cabe, que é a única coisa que ele não pode dizer errado.
   */
  readonly distanceFromDoorM: string | null
  readonly label: string
  /**
   * Spec 088 R4: quantas caixas por camada e quantas camadas, quando **toda** caixa desta parada
   * está medida. `null` com uma faltando — a faixa mostra só a profundidade, e a tela diz quantas
   * ainda faltam medir. É aqui que a fila de medição da 085 paga.
   */
  readonly layers: CargoPlanLayers | null
  /**
   * Quantas caixas desta parada faltam medir. ⚠️ `layers` nulo tem **duas** causas — esta, e caixa
   * maior que a própria faixa —, e sem separá-las a tela manda medir quem já mediu tudo.
   */
  readonly boxesToMeasure: number
  /**
   * A ordem de **carregamento**, que é o inverso da de entrega: quem entrega por último viaja no
   * fundo, e quem entrega primeiro fica na porta. `1` é o fundo.
   */
  readonly loadOrder: number
  readonly sequence: number
  /** Fração da capacidade que esta parada ocupa. */
  readonly share: string
  readonly volumeM3: string
}

/**
 * Uma fileira do baú, do fundo para a porta. A parada dona aparece em fileiras **seguidas**, e é
 * daí que sai a quebra da carga em blocos da mesma cor — consequência da quantização, nunca regra
 * escolhendo quando partir.
 */
export type CargoLayoutRow = {
  readonly label: string
  readonly loadOrder: number
  readonly sequence: number
  /**
   * ⚠️ Se dá para chegar nesta carga **sem descarregar o que está na frente**. Só existe em veículo
   * com porta lateral ou carroceria aberta; no baú que abre atrás é sempre `false`.
   */
  readonly sideReachable: boolean
}

export type ResolvedCargoLayout = {
  /** O comprimento interno do baú, da ficha. `null` sem as três medidas — e aí não há planta. */
  readonly bedLengthM: string | null
  /**
   * Spec 094: o arranjo camada por camada. `null` quando o baú não tem medida — a mesma regra da
   * 088 D2, e pelo mesmo motivo: sem escala o desenho não pode prometer metro.
   */
  readonly placement: CargoPlacement | null
  /** A largura interna, que é a outra dimensão da planta vista de cima. Anda junto com a de cima. */
  readonly bedWidthM: string | null
  /** Metros de baú vazios entre a carga e a porta. Espelha `freeRows`, agora em metro. */
  readonly freeDepthM: string | null
  /** Metros de carga que atravessam a porta. Desenhados **fora** dela, nunca comprimidos. */
  readonly overflowDepthM: string | null
  /** Quanto passou da capacidade — representado **fora** do baú, nunca comprimido para caber. */
  readonly overflowM3: string
  readonly rows: readonly CargoLayoutRow[]
  /**
   * ⚠️ `true` quando a ordem é **obrigação**, não conveniência: veículo que abre só atrás obriga a
   * última entrega a viajar no fundo. Com lateral ela ainda ajuda, e a tela precisa dizer isso —
   * senão o conferente lê uma exigência onde há uma sugestão.
   */
  readonly orderIsBinding: boolean
  /** Fileiras vazias entre a carga e a porta. Zero quando não se sabe a capacidade. */
  readonly freeRows: number
  /**
   * ⚠️ `false` quando não há capacidade: aí o desenho divide a carga e **cala sobre o espaço
   * livre**. É a metade da D3 da spec 076 que continua de pé.
   */
  readonly occupancyKnown: boolean
  /** Fatia sobre a capacidade. Vazia sem capacidade — sem denominador ela não existe. */
  readonly slices: readonly CargoLayoutSlice[]
  /** Paradas cujas notas não têm cubagem: ditas à parte, nunca desenhadas como fatia zero. */
  readonly stopsWithoutVolume: readonly { readonly documentCount: number; readonly label: string }[]
}

/** Uma dúzia é o que o conferente enxerga de relance; mais paradas que isso alargam o baú. */
const DEFAULT_ROW_COUNT = 12

/**
 * Reparte `total` fileiras entre pesos, por maior resto, com **piso de uma fileira** para todo
 * peso positivo: fileira zero é invisível e some da conferência — a mesma razão que já tira a
 * parada sem cubagem do desenho, em vez de desenhá-la como fatia nula.
 */
function distributeRows(weights: readonly bigint[], total: number): readonly number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0n)
  if (sum <= 0n) return weights.map(() => 0)

  const exact = weights.map((weight) => (Number(weight) / Number(sum)) * total)
  const rows = exact.map((value) => Math.max(1, Math.floor(value)))

  /** O piso pode estourar o total; o excedente sai de quem tem mais, nunca de quem tem uma só. */
  let assigned = rows.reduce((acc, value) => acc + value, 0)
  while (assigned > total) {
    const maior = rows.indexOf(Math.max(...rows))
    const atual = rows[maior]
    if (atual === undefined || atual <= 1) break
    rows[maior] = atual - 1
    assigned -= 1
  }
  /** E o que falta vai para o maior resto, que é o que preserva a proporção. */
  while (assigned < total) {
    const restos = exact.map((value, index) => value - (rows[index] ?? 0))
    const maior = restos.indexOf(Math.max(...restos))
    rows[maior] = (rows[maior] ?? 0) + 1
    assigned += 1
  }
  return rows
}

/**
 * Soma decimal de verdade: `Number` traria erro binário para dentro de um volume. Mora aqui, ao
 * lado da escala que ela usa, porque o repositório e a prévia somam o mesmo volume — duas cópias
 * divergiriam na primeira mudança de escala.
 */
export function sumVolumes(values: readonly string[]): string {
  return formatScaledDecimal(
    values.reduce((accumulated, value) => accumulated + toScaled(value), 0n),
    VOLUME_SCALE,
  )
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

function toLength(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: LENGTH_SCALE, value })
}

/**
 * Spec 088 D2: **a escala sai da ficha, e sem ficha não há planta.**
 *
 * ⚠️ `capacityDimensions` chega preenchida também no degrau `reference`, porque a ocupação aceita o
 * palpite de mercado como piso de m³. A planta não aceita: a dispersão dentro de um tipo chega a 2×
 * — um VUC existe de 13 e de 26 m³ —, e ali o erro deixa de ser uma porcentagem e vira metro na
 * tela de quem vai conferir com fita. Este filtro é o único lugar onde essa linha é traçada.
 */
export function resolveBedDimensions(
  occupancy: {
    readonly capacityDimensions: CargoBedDimensions | null
    readonly capacitySource: 'declared' | 'measured' | 'reference'
  } | null,
): CargoBedDimensions | null {
  if (occupancy === null || occupancy.capacitySource !== 'measured') return null

  return occupancy.capacityDimensions
}

/**
 * Spec 076: a fatia do baú de cada parada.
 *
 * ⚠️ **É representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume — a
 * cubagem é estimada e é um total por nota, não a caixa. Não há como calcular onde cada caixa vai,
 * e um desenho que sugerisse posição estaria inventando algo que alguém seguiria ao carregar.
 *
 * A unidade é a **parada**, nunca a nota (D2): o motorista abre a porta uma vez por endereço, e
 * fatiar por nota produziria dezenas de faixas que ninguém lê.
 *
 * `null` quando a capacidade não é conhecida (D3): sem proporção, um retângulo genérico "só para
 * ilustrar" seria uma afirmação falsa sobre espaço.
 */
export function resolveCargoLayout(input: {
  /** Da ficha, e só dela — quem monta este campo passa por `resolveBedDimensions`. */
  readonly bedDimensions?: CargoBedDimensions | null
  readonly capacityM3: string | null
  /**
   * ⚠️ Ausente assume `rear`, o **mais restritivo**. Assumir a lateral por omissão diria que dá
   * para alcançar o meio de um baú que só abre atrás, e quem seguisse carregaria errado.
   */
  readonly loadingAccess?: LoadingAccess
  /**
   * Spec 094: o volume típico de uma caixa da empresa, para a presumida ter tamanho. Sem ele a
   * caixa não medida continua fora do desenho — e nomeada, que é melhor que inventada.
   */
  readonly fallbackBoxVolumeM3?: number | null
  /** As formas medidas, de onde sai a **proporção** da caixa presumida. */
  readonly measuredShapes?: readonly MeasuredBoxShape[]
  readonly stops: readonly CargoLayoutStop[]
}): ResolvedCargoLayout | null {
  const capacity = toScaled(input.capacityM3)

  const withVolume = input.stops.filter((stop) => stop.volumeM3 !== null)
  const ordered = [...withVolume].sort((first, second) => first.sequence - second.sequence)
  const loaded = ordered.reduce((acc, stop) => acc + toScaled(stop.volumeM3), 0n)

  /**
   * ⚠️ Sem capacidade a fatia não existe — ela é sobre a capacidade, e sem denominador seria
   * invenção. As **fileiras** existem, porque a divisão entre paradas é invariante ao fator
   * (spec 085 D1, medido em 345 NF-e): `f` cancela entre numerador e denominador.
   */
  const occupancyKnown = capacity > 0n

  /**
   * Spec 088: a seção do baú é o que converte volume em metro de comprimento. Ela existe só com as
   * três medidas da ficha — `bedLength` nulo é o caso normal hoje, e o desenho volta a ser o da 085.
   */
  const bed = input.bedDimensions ?? null
  const bedLength = bed === null ? 0n : toLength(bed.lengthM)
  const section =
    bed === null ? 0n : divideHalfUp(toLength(bed.widthM) * toLength(bed.heightM), LENGTH_FACTOR)
  const bedKnown = bedLength > 0n && section > 0n

  /** Do fundo para a porta, na ordem de carregamento: `loadOrder` 1 encosta na parede do fundo. */
  const depthByLoadOrder = new Map<number, bigint>()
  for (const [index, stop] of ordered.entries()) {
    depthByLoadOrder.set(
      ordered.length - index,
      bedKnown
        ? divideHalfUp(toScaled(stop.volumeM3) * LENGTH_FACTOR, section * VOLUME_TO_LENGTH_FACTOR)
        : 0n,
    )
  }
  const loadedDepth = [...depthByLoadOrder.values()].reduce((acc, depth) => acc + depth, 0n)

  /**
   * Quanto de baú já foi ocupado atrás desta faixa, contado da parede do fundo. Varre o mapa em vez
   * de guardar um acumulado: uma viagem tem paradas em dezenas, e a soma direta é a que se lê.
   */
  function backOffsetOf(loadOrder: number): bigint {
    let offset = 0n
    for (const [order, depth] of depthByLoadOrder) if (order < loadOrder) offset += depth
    return offset
  }

  const slices = !occupancyKnown
    ? []
    : ordered.map((stop, index) => {
        const volume = toScaled(stop.volumeM3)
        const share =
          volume >= capacity ? SHARE_FACTOR : divideHalfUp(volume * SHARE_FACTOR, capacity)
        /** O fundo é `1`, e ele pertence à **última** entrega. */
        const loadOrder = ordered.length - index
        const depth = depthByLoadOrder.get(loadOrder) ?? 0n
        const depthM = bedKnown ? formatScaledDecimal(depth, LENGTH_SCALE) : null
        return {
          depthM,
          distanceFromDoorM: bedKnown
            ? formatScaledDecimal(bedLength - backOffsetOf(loadOrder) - depth, LENGTH_SCALE)
            : null,
          boxesToMeasure: countBoxesToMeasure(stop.boxes ?? []),
          label: stop.label,
          layers: resolveCargoPlanLayers({
            bandDepthM: depthM,
            bed,
            boxes: stop.boxes ?? [],
          }),
          loadOrder,
          sequence: stop.sequence,
          share: formatScaledDecimal(share, SHARE_SCALE),
          volumeM3: formatScaledDecimal(volume, VOLUME_SCALE),
        }
      })

  /** Parada nenhuma pode sumir, então o baú alarga quando a viagem tem mais paradas que fileiras. */
  const rowCount = Math.max(DEFAULT_ROW_COUNT, ordered.length)
  const cargoRows =
    !occupancyKnown || loaded >= capacity
      ? rowCount
      : Math.min(
          rowCount,
          Math.max(ordered.length, Math.round((Number(loaded) / Number(capacity)) * rowCount)),
        )
  const perStop = distributeRows(
    ordered.map((stop) => toScaled(stop.volumeM3)),
    cargoRows,
  )

  const access = input.loadingAccess ?? 'rear'
  const sideReachable = access !== 'rear'

  /** Do fundo para a porta: `loadOrder` 1 primeiro, que é a última entrega. */
  const rows = ordered
    .map((stop, index) => ({
      count: perStop[index] ?? 0,
      label: stop.label,
      loadOrder: ordered.length - index,
      sequence: stop.sequence,
      sideReachable,
    }))
    .sort((first, second) => first.loadOrder - second.loadOrder)
    .flatMap(({ count, ...row }) => Array.from({ length: count }, () => row))

  return {
    bedLengthM: bedKnown ? formatScaledDecimal(bedLength, LENGTH_SCALE) : null,
    /**
     * ⚠️ A ordem das paradas aqui é a **de carregamento** (`ordered`), a mesma das fileiras: a
     * última entrega no fundo. Passar as paradas na ordem de entrega faria a planta desenhar o
     * inverso do que o painel acima dela mostra, e as duas ficariam brigando na mesma tela.
     */
    placement: resolveCargoPlacement({
      bed,
      boxes: toPlacementBoxes({
        fallbackVolumeM3: input.fallbackBoxVolumeM3 ?? null,
        measuredShapes: input.measuredShapes ?? [],
        stops: ordered,
      }),
    }),
    bedWidthM:
      bed === null || !bedKnown ? null : formatScaledDecimal(toLength(bed.widthM), LENGTH_SCALE),
    freeDepthM: bedKnown
      ? formatScaledDecimal(bedLength > loadedDepth ? bedLength - loadedDepth : 0n, LENGTH_SCALE)
      : null,
    freeRows: Math.max(0, occupancyKnown ? rowCount - rows.length : 0),
    occupancyKnown,
    overflowDepthM: bedKnown
      ? formatScaledDecimal(loadedDepth > bedLength ? loadedDepth - bedLength : 0n, LENGTH_SCALE)
      : null,
    orderIsBinding: access === 'rear',
    overflowM3: formatScaledDecimal(
      occupancyKnown && loaded > capacity ? loaded - capacity : 0n,
      VOLUME_SCALE,
    ),
    rows,
    slices,
    stopsWithoutVolume: input.stops
      .filter((stop) => stop.volumeM3 === null)
      .map((stop) => ({ documentCount: stop.documentsWithoutVolume, label: stop.label })),
  }
}

/**
 * As caixas de todas as paradas, na ordem de carregamento, prontas para o empacotador.
 *
 * ⚠️ A `sequence` da parada viaja junto porque é ela que o desenho colore — a paleta da planta é a
 * mesma das faixas, e sem a sequência as duas mostrariam cores diferentes para a mesma parada.
 */
function toPlacementBoxes(
  input: Readonly<{
    fallbackVolumeM3: number | null
    measuredShapes: readonly MeasuredBoxShape[]
    stops: readonly CargoLayoutStop[]
  }>,
): readonly PlacementBox[] {
  /**
   * ⚠️ A caixa presumida é derivada **uma vez**, não por caixa: a proporção e o volume são os
   * mesmos para toda a empresa, e recalcular por linha só gastaria tempo repetindo a mesma conta.
   */
  const fallback = resolveFallbackBox({
    measured: input.measuredShapes,
    volumeM3: input.fallbackVolumeM3,
  })

  return input.stops.flatMap((stop) =>
    (stop.boxes ?? []).map((box) => {
      const measured = box.heightMm !== null && box.lengthMm !== null && box.widthMm !== null
      /** Sem medida e sem fallback, a caixa segue sem dimensão e a planta a nomeia como não medida. */
      const shape = measured ? box : (fallback ?? box)

      return {
        count: box.count,
        heightMm: shape.heightMm,
        isFragile: box.isFragile ?? null,
        isStackable: box.isStackable ?? null,
        keepUpright: box.keepUpright ?? null,
        label: box.label ?? stop.label,
        lengthMm: shape.lengthMm,
        maxStackCount: box.maxStackCount ?? null,
        /** A origem é a da **caixa**, não a do arranjo: é ela que sai hachurada no desenho. */
        source: measured ? ('measured' as const) : ('estimated' as const),
        stopSequence: stop.sequence,
        widthMm: shape.widthMm,
      }
    }),
  )
}
