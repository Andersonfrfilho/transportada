/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_CARGO_LAYOUT'
const VOLUME_SCALE = 6n
const SHARE_SCALE = 4n
const SHARE_FACTOR = 10n ** SHARE_SCALE

export type CargoLayoutStop = {
  readonly documentsWithoutVolume: number
  readonly label: string
  readonly sequence: number
  readonly volumeM3: string | null
}

export type CargoLayoutSlice = {
  readonly label: string
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
  readonly capacityM3: string | null
  /**
   * ⚠️ Ausente assume `rear`, o **mais restritivo**. Assumir a lateral por omissão diria que dá
   * para alcançar o meio de um baú que só abre atrás, e quem seguisse carregaria errado.
   */
  readonly loadingAccess?: LoadingAccess
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
  const slices = !occupancyKnown
    ? []
    : ordered.map((stop, index) => {
        const volume = toScaled(stop.volumeM3)
        const share =
          volume >= capacity ? SHARE_FACTOR : divideHalfUp(volume * SHARE_FACTOR, capacity)
        return {
          label: stop.label,
          /** O fundo é `1`, e ele pertence à **última** entrega. */
          loadOrder: ordered.length - index,
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
    freeRows: Math.max(0, occupancyKnown ? rowCount - rows.length : 0),
    occupancyKnown,
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
