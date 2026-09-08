/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O traço que liga as paradas — e a distinção que ele **precisa** carregar.
 *
 * ⚠️ **Uma reta entre duas paradas atravessa rio, serra e ferrovia sem pedir licença.** Desenhá-la
 * com o mesmo traço da estrada faz o operador ler caminho onde não há. Quando a geometria do OSRM
 * chega, a linha é sólida e segue a estrada; quando não chega — serviço ausente, fora do ar ou rota
 * impossível —, ela é tracejada, e a legenda ao lado diz que é linha reta.
 *
 * Medido em staging: a linha real de uma viagem de 64 km cabe em 162 pontos e 3,5 KB, com erro
 * menor que um pixel. O que a tela não mostra não atravessa a rede.
 */

export const ROUTE_GEOMETRY_SOURCES = ['road', 'unavailable'] as const
export type RouteGeometrySource = (typeof ROUTE_GEOMETRY_SOURCES)[number]

/**
 * O que o trecho entre duas paradas **custou na estrada**, na unidade que o roteirizador publica.
 * Ele vem junto da geometria, na mesma resposta — ver `assemblyLeg.service.ts`.
 */
export type RouteGeometryLeg = Readonly<{
  distanceMetres: number
  durationSeconds: number
}>

/** De onde saiu a contagem de eixos — declarada na ficha, ou estimada pelo tipo (spec 090 D2). */
export const AXLE_COUNT_SOURCES = ['declared', 'estimated'] as const
export type AxleCountSource = (typeof AXLE_COUNT_SOURCES)[number]

export type AxleCount = Readonly<{ count: number; source: AxleCountSource }>

/**
 * Uma praça que a rota passou, na ordem de passagem (spec 090 T7/T8).
 *
 * ⚠️ `latitude`/`longitude` existem só para o mapa desenhar o ícone sobre a praça **do trajeto**
 * (spec 096 D3/T4) — nunca para casar a praça pela coordenada, que continua sendo a identidade do
 * nó no backend.
 */
export type RouteGeometryTollBooth = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  /**
   * O que **esta** praça custou por eixo neste veículo — a tarifa da tag quando ele a tem e ela
   * existe, a manual no resto. ⚠️ É este valor que o extrato imprime, nunca o `chargePerAxle` cru:
   * com tag o cru é a tarifa que o veículo não pagou, e linhas que não somam o total fazem duvidar
   * do total. `null` é praça sem tarifa conhecida — nunca zero, que diria cancela franca.
   */
  effectiveChargePerAxle: null | string
  /** Esta praça não tem tarifa de tag e caiu para a manual (spec 095 D3). */
  fellBackToManual: boolean
  /** `effectiveChargePerAxle × eixos`, e `null` pela mesma razão. */
  total: null | string
  latitude: string
  longitude: string
  name: null | string
  operator: null | string
  osmNodeId: number
}>

/** Se o veículo paga com tag ou não — a base que decide qual tarifa de cada praça vale (spec 095 D3). */
export const TOLL_PAYMENT_MODES = ['automatic', 'manual'] as const
export type TollPaymentMode = (typeof TOLL_PAYMENT_MODES)[number]

/**
 * O pedágio da rota, vindo na **mesma** resposta que a geometria (spec 090 D4) — nunca de uma
 * segunda chamada, que poderia discordar do traço desenhado.
 */
export type RouteGeometryToll = Readonly<{
  axles: AxleCount
  booths: readonly RouteGeometryTollBooth[]
  /** Quantas das praças acima não têm tarifa conhecida — o total sozinho seria número crível e
   *  possivelmente falso (medido: 4 das 166 praças declaram `0.00`, campo não mapeado). */
  boothsWithoutCharge: number
  /** Quantas praças caíram para a manual por falta de tarifa automática (spec 095 D3) — só
   *  existe quando `paymentMode` é `automatic`. Nunca se aplica desconto estimado. */
  boothsFallenBackToManual: number
  chargePerAxle: string
  /** Se o veículo paga com tag — a base que a tela mostra ao lado do total. */
  paymentMode: TollPaymentMode
  /** A mais antiga entre as praças cobradas; `null` quando a rota não passou por praça nenhuma. */
  tariffObservedOn: null | string
  total: string
}>

/**
 * Por que não há rota mais barata — as duas razões são ausência de dado, nunca empate (spec 096
 * D1): o rótulo simplesmente não é atribuído, e a tela diz qual das duas faltou.
 */
export const ROUTE_COST_GAPS = ['NO_FUEL_BASELINE', 'TOLL_UNKNOWN'] as const
export type RouteCostGap = (typeof ROUTE_COST_GAPS)[number]

/**
 * Uma alternativa de rota (spec 096 T1) — a mesma forma que os campos de sempre de `RouteGeometry`
 * (`legs`, `points`, `toll`), mais o que só faz sentido comparando opções entre si.
 */
export type RouteGeometryOption = Readonly<{
  distanceMeters: number
  durationSeconds: number
  /** `null` quando o veículo não declara consumo/preço, ou quando o pedágio é desconhecido. */
  fuelTotal: null | string
  legs: readonly RouteGeometryLeg[]
  points: readonly Readonly<{ latitude: string; longitude: string }>[]
  toll: null | RouteGeometryToll
  totalCost: null | string
}>

/**
 * Spec 097: por que a perna do barracão ficou de fora. As duas razões são separadas porque o
 * remédio é diferente — uma pede cadastro do endereço, a outra pede que a geocodificação o alcance.
 */
export const ROUTE_DEPOT_ABSENCES = ['not_configured', 'not_geocoded'] as const
export type RouteDepotAbsence = (typeof ROUTE_DEPOT_ABSENCES)[number]

/**
 * A perna do barracão nesta rota. `leadingLegs`/`trailingLegs` dizem quantos trechos de `legs` são
 * dela — ⚠️ sem esses dois números a tela casaria trecho com a parada errada, ou descartaria todos.
 */
/**
 * Quem é o barracão, para a perna dizer de onde o caminhão sai.
 *
 * ⚠️ É o endereço **da empresa**, não uma leitura do ponto de partida: a origem do roteirizador é
 * uma chave com coordenada e nenhum endereço escrito, e descobrir a rua a partir dela seria
 * geocodificação reversa (ADR-0044). Por isso a tela nomeia a empresa em vez de afirmar a rua do
 * galpão — quem cadastrou uma origem diferente da sede leria uma mentira plausível.
 */
export type DepotDescription = Readonly<{
  address: string
  legalName: string
  /** `null` quando a empresa não cadastrou telefone: a linha some, nunca vira traço. */
  phone: null | string
  tradeName: string
}>

export type RouteGeometryDepot = Readonly<{
  absence: null | RouteDepotAbsence
  description: null | DepotDescription
  leadingLegs: number
  /**
   * Spec 097 D4: onde o barracão está, para o mapa marcá-lo com **forma própria** — nunca o pino
   * numerado das entregas. `null` quando a perna não entrou.
   */
  origin: null | Readonly<{ latitude: string; longitude: string }>
  trailingLegs: number
}>

export type RouteGeometry = Readonly<{
  /**
   * Spec 097: a perna do barracão. Ausente ou `null` é "esta rota não pediu barracão" — distinto
   * de "pediu e não achou", que vem com `absence` preenchida e é o que a tela anuncia (D2).
   */
  depot?: null | RouteGeometryDepot
  /** Um por par de paradas consecutivas. Vazio quando a estrada não veio — nunca estimado.
   *  ⚠️ Sempre os da rota **principal** — ver `options[0]` para as alternativas (spec 096 T1). */
  legs: readonly RouteGeometryLeg[]
  points: readonly Readonly<{ latitude: string; longitude: string }>[]
  /** `null` quando ninguém pediu pedágio (sem veículo escolhido) ou a rota não anotou os nós. */
  toll: null | RouteGeometryToll
  source: RouteGeometrySource
  /**
   * As rotas que o roteirizador ofereceu, a principal em `[0]` (spec 096 T1). Campo opcional para
   * não quebrar literal antigo desta tela — ausente é tratado igual a lista vazia.
   */
  options?: readonly RouteGeometryOption[]
  /** Índice em `options` da rota mais barata. `null` quando `costGap` diz por que não há uma. */
  cheapestIndex?: null | number
  /** Por que não há mais barata — ausência de dado, nunca empate. */
  costGap?: null | RouteCostGap
  /** Índice em `options` da rota mais rápida. */
  fastestIndex?: null | number
  /** `false` quando o roteirizador só ofereceu um caminho — a tela não desenha seletor. */
  hasChoice?: boolean
}>

export type ProjectedPoint = Readonly<{ x: number; y: number }>

export type RouteTraceKind = 'road' | 'straight'

export type RouteTrace = Readonly<{
  dashed: boolean
  kind: RouteTraceKind
  path: string
}>

export function resolveRouteTrace(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): RouteTrace {
  const road = input.geometry?.source === 'road' ? input.geometry.points : []

  if (road.length >= 2) {
    const projected = road.map((point) =>
      input.project({ latitude: Number(point.latitude), longitude: Number(point.longitude) }),
    )
    return { dashed: false, kind: 'road', path: toPath(projected) }
  }

  return { dashed: true, kind: 'straight', path: toPath(input.stops) }
}

/**
 * Um pedaço do traço, com a **parada de destino** dele — é ela que dá a cor.
 *
 * ⚠️ O traço era uma linha só, em `--color-copper`, e o laranja já é usado por outros traços do mapa:
 * o roteiro se confundia com o fundo. Pintar cada trecho com a cor da parada a que ele leva casa o
 * mapa com a listagem, e é a listagem que a pessoa está lendo ao lado.
 */
export type RouteTraceSegment = RouteTrace & Readonly<{ toSequence: number }>

/** O mesmo trecho antes de virar `path`: o MapLibre quer coordenada, não `d` de SVG. */
export type RouteLeg = Readonly<{
  dashed: boolean
  kind: RouteTraceKind
  points: readonly ProjectedPoint[]
  toSequence: number
}>

/**
 * Corta o traço em um trecho por par de paradas consecutivas.
 *
 * ⚠️ **Os `legs` não dizem onde cada trecho começa na polilinha** — eles trazem só distância e
 * duração. O corte é feito achando, para cada parada, o ponto da polilinha mais próximo dela. Isso
 * **não é palpite**: a polilinha foi gerada roteirizando por essas paradas, então o roteirizador
 * encostou a geometria em cada uma. O que se recupera é informação que já está lá.
 *
 * Os índices saem **monotônicos por construção** — cada busca começa onde a anterior parou —, senão
 * uma rota que passa duas vezes perto da mesma parada produziria trecho de comprimento negativo.
 *
 * Sem estrada, cada trecho é a reta entre duas paradas: aí o corte é exato, e o tracejado continua
 * dizendo que aquilo não é caminho.
 */
export function resolveRouteLegs(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): readonly RouteLeg[] {
  if (input.stops.length < 2) return []

  const road = input.geometry?.source === 'road' ? input.geometry.points : []
  if (road.length < 2) {
    return input.stops.slice(1).flatMap((stop, index) => {
      const from = input.stops[index]
      if (from === undefined) return []

      return [
        { dashed: true, kind: 'straight' as const, points: [from, stop], toSequence: index + 2 },
      ]
    })
  }

  const projected = road.map((point) =>
    input.project({ latitude: Number(point.latitude), longitude: Number(point.longitude) }),
  )
  const cuts = cutIndexes({ projected, stops: input.stops })

  return cuts.slice(1).flatMap((end, index) => {
    const start = cuts[index] ?? 0
    const slice = projected.slice(start, end + 1)
    if (slice.length < 2) return []

    return [{ dashed: false, kind: 'road' as const, points: slice, toSequence: index + 2 }]
  })
}

export function resolveRouteTraceSegments(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): readonly RouteTraceSegment[] {
  return resolveRouteLegs(input).map((leg) => ({
    dashed: leg.dashed,
    kind: leg.kind,
    path: toPath(leg.points),
    toSequence: leg.toSequence,
  }))
}

function cutIndexes(input: {
  readonly projected: readonly ProjectedPoint[]
  readonly stops: readonly ProjectedPoint[]
}): readonly number[] {
  const cuts: number[] = [0]
  let from = 0

  for (const stop of input.stops.slice(1)) {
    let best = from
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = from; index < input.projected.length; index += 1) {
      const point = input.projected[index]
      if (point === undefined) continue
      const distance = (point.x - stop.x) ** 2 + (point.y - stop.y) ** 2
      if (distance >= bestDistance) continue
      bestDistance = distance
      best = index
    }
    cuts.push(best)
    from = best
  }

  /** A última parada fecha no fim da polilinha: o roteirizador não devolve ponto depois dela. */
  cuts[cuts.length - 1] = input.projected.length - 1

  return cuts
}

function toPath(points: readonly ProjectedPoint[]): string {
  if (points.length < 2) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ')
}

/** Três casas no `viewBox` de 100: abaixo do que qualquer tela distingue, e encurta o `d`. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
