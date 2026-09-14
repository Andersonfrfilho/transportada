/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha da estrada da viagem, para o mapa.
 *
 * Rota **própria e preguiçosa**, fora do detalhe da viagem: a chamada ao OSRM custou 63 ms medidos
 * em staging, e o detalhe é leitura quente que abre a tela inteira. O mapa desenha as paradas
 * primeiro e engrossa a linha depois.
 */
import {
  describeTollBoothCharges,
  resolveTollRouteCost,
  type TollBoothStatementLine,
  type AxleCount,
  type TollRouteCost,
} from '../../toll-booths/domain/toll-route-cost.policy.js'
import {
  rankRouteOptions,
  type RouteCostGap,
  type RouteOptionVehicle,
} from '../../toll-booths/domain/route-option.policy.js'
import type { TollBoothRouteRecord } from '../../toll-booths/application/toll-booth.port.js'
import {
  planRouteFromDepot,
  type RouteDepot,
  type RouteDepotAbsence,
} from '../domain/route-depot.policy.js'
import {
  formatTollMultiplier,
  type TollMultiplier,
} from '../../toll-booths/domain/toll-category.policy.js'
import type { DepotDescription } from '../domain/depot-description.policy.js'
import { simplifyRouteGeometry, type RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type {
  RouteGeometryLeg,
  RouteGeometryPort,
  RouteGeometryRoad,
} from './route-geometry.port.js'

/**
 * O desvio máximo aceito entre a linha desenhada e a estrada de verdade.
 *
 * ⚠️ **Cinco metros porque o mapa tem zoom.** O valor anterior era derivado da extensão da rota
 * (`extent / 600`), herdado do mapa SVG de largura fixa — nesta rota de três paradas isso dava
 * **126 metros**, e a linha cortava quarteirão e saía da rua ao aproximar. Cinco metros é menos que
 * a largura de uma pista, então a linha fica sobre o asfalto em qualquer zoom que o painel alcança.
 */
const TOLERANCE_METRES = 5

/** Cinco casas ≈ 1 m: abaixo do pixel em qualquer escala que este mapa desenhe. */
const COORDINATE_SCALE = 5

export const ROUTE_GEOMETRY_SOURCES = ['road', 'unavailable'] as const
export type RouteGeometrySource = (typeof ROUTE_GEOMETRY_SOURCES)[number]

/**
 * O pedágio da rota, mais a data da tarifa (spec 090 T7). A política pura (`resolveTollRouteCost`,
 * T5) não conhece data — ela decide só quem passou e quanto custa — e é este use case que junta a
 * data de cada praça cobrada para a tela imprimir ao lado do total.
 */
/**
 * A linha do extrato, mais **em que trecho da rota** ela é cruzada — o que põe a praça entre as duas
 * paradas certas na sequência da montagem.
 *
 * ⚠️ Isto não é da política pura do pedágio: ela decide quem passou e quanto custa, e não conhece
 * roteiro. O trecho vem da anotação de nós do OSRM, agrupada por perna, e é este use case que junta
 * as duas coisas — o mesmo corte que já faz com a data da tarifa.
 *
 * ⚠️ `null` é desconhecimento: rota sem anotação de nós. A tela deixa a praça fora da sequência e a
 * mostra só no extrato completo, em vez de pendurá-la num trecho por palpite.
 */
export type TollBoothRouteLine = TollBoothStatementLine & Readonly<{ legIndex: null | number }>

export type RouteGeometryToll = Omit<TollRouteCost, 'booths'> &
  Readonly<{
    /**
     * O extrato: praça a praça, com o que cada uma custou **neste** veículo e a marca de quem caiu
     * para a tarifa manual. Ele é derivado na leitura (`describeTollBoothCharges`) e não entra no
     * jsonb congelado — o congelado guarda a observação, e a interpretação se recomputa.
     */
    booths: readonly TollBoothRouteLine[]
    /**
     * A fração já como rótulo (`1`, `1,5`, `3`), ao lado do par que a gerou.
     *
     * ⚠️ Os dois convivem de propósito: o **par** é o que se congela, porque é a conta; o **rótulo**
     * é o que a tela imprime, e derivá-lo no frontend obrigaria a reescrever ali a regra de formatar
     * meia tarifa — cópia por valor de uma coisa que ninguém confere de olho.
     */
    multiplierLabel: string
    /**
     * A mais antiga entre as praças cobradas — a leitura conservadora quando o cadastro tem seeds
     * de datas diferentes. `null` quando a rota não passou por praça nenhuma: não há tarifa a datar.
     */
    tariffObservedOn: null | string
  }>

/**
 * Uma alternativa da rota, pronta para o mapa (spec 096 T1) — a mesma forma que os campos de
 * sempre de `RouteGeometryView` (`legs`, `points`, `toll`), mais o que só faz sentido comparando
 * opções entre si.
 */
export type RouteGeometryOption = Readonly<{
  readonly distanceMeters: number
  readonly durationSeconds: number
  /** `null` quando o veículo não declara consumo/preço, ou quando o pedágio é desconhecido. */
  readonly fuelTotal: null | string
  readonly legs: readonly RouteGeometryLeg[]
  readonly points: readonly { readonly latitude: string; readonly longitude: string }[]
  readonly toll: null | RouteGeometryToll
  readonly totalCost: null | string
}>

/**
 * A perna do barracão nesta rota (spec 097). `null` no `RouteGeometryView` quando ninguém pediu
 * barracão nesta chamada — ausência de pedido não é ausência de barracão.
 */
export type RouteGeometryDepot = Readonly<{
  /** Por que a perna ficou de fora. `null` quando ela entrou — e é isto que a tela imprime (D2). */
  absence: null | RouteDepotAbsence
  /**
   * Quem é o barracão: a empresa, o endereço dela e o telefone. ⚠️ É o endereço **da empresa**, não
   * uma leitura do ponto de partida — a origem do roteirizador é uma chave com coordenada e nenhum
   * endereço escrito, e descobrir a rua a partir dela seria geocodificação reversa (ADR-0044).
   */
  description: null | DepotDescription
  /**
   * Quantos trechos do começo de `legs` são a saída do barracão, e quantos do fim são o retorno.
   * ⚠️ Sem estes dois números a tela não tem como pendurar o trecho certo ao pé de cada parada: a
   * lista numerada é só das entregas (D3), e o total é da rota inteira.
   */
  leadingLegs: number
  /**
   * Onde o barracão está, para o mapa marcá-lo com forma própria (D4) — `null` quando a perna não
   * entrou. ⚠️ Sai como texto, na mesma escala dos pontos do traçado: o resto da resposta usa texto
   * decimal, e um número solto aqui obrigaria a tela a tratar duas formas para a mesma grandeza.
   */
  origin: null | Readonly<{ latitude: string; longitude: string }>
  trailingLegs: number
}>

export type RouteGeometryView = {
  /** A perna do barracão — `null` quando esta chamada não pediu barracão nenhum (spec 097). */
  readonly depot: null | RouteGeometryDepot
  /**
   * Um trecho por par de paradas consecutivas, **medido na estrada**. Vazio quando a estrada não
   * veio — e aí a tela não mostra tempo nenhum. A ADR-0044 §5 é explícita: sem o roteirizador não se
   * estima, porque número plausível e errado é pior que número nenhum.
   *
   * ⚠️ **Sempre os da rota principal** — a primeira que o OSRM devolveu (spec 096 D2/spec.md: a
   * alternativa é oferta, nunca troca automática). Quem já lia este campo antes da 096 continua
   * lendo a mesma coisa.
   */
  readonly legs: readonly RouteGeometryLeg[]
  readonly points: readonly { readonly latitude: string; readonly longitude: string }[]
  readonly source: RouteGeometrySource
  /** Igual a `toll`, `legs` e `points`: sempre a rota principal, por compatibilidade. */
  readonly toll: null | RouteGeometryToll
  /**
   * Todas as rotas que o roteirizador ofereceu — a principal em `options[0]`, seguida das
   * alternativas na ordem que o OSRM devolveu. Vazio só quando `source` é `unavailable`.
   */
  readonly options: readonly RouteGeometryOption[]
  /** Índice em `options` da rota mais barata — `null` quando `costGap` diz por que não há uma. */
  readonly cheapestIndex: null | number
  /** Por que não há mais barata: ausência de dado, nunca empate (spec 096 D1). */
  readonly costGap: null | RouteCostGap
  /** Índice em `options` da rota mais rápida. `null` só quando não há rota nenhuma. */
  readonly fastestIndex: null | number
  /** `false` quando o roteirizador só ofereceu um caminho — a tela não desenha seletor (D2). */
  readonly hasChoice: boolean
}

/** As praças que a rota pode ter passado, pelos ids de nó que a mesma chamada devolveu. */
export type ReadRouteGeometryTollBoothsPort = {
  readByNodeIds: (nodeIds: readonly number[]) => Promise<readonly TollBoothRouteRecord[]>
}

/**
 * De onde o caminhão sai, e onde ele termina (spec 097 D1). A porta devolve a política **já
 * resolvida em coordenada**, lida da mesma `company_route_optimization_settings` que o solver usa.
 */
export type ReadRouteGeometryDepotPort = {
  readDepot: () => Promise<RouteDepot>
  /** Quem é a empresa — para a linha da perna dizer de onde o caminhão sai (spec 097). */
  readDescription: () => Promise<DepotDescription | null>
}

export type ReadRouteGeometryInput = {
  /** Quantos eixos o veículo escolhido tem, e de onde o número veio (spec 090 D2). */
  readonly axles?: AxleCount | null
  /**
   * Quanto da tarifa base a cancela cobra deste veículo — a **categoria**, não a contagem de eixos.
   * Ausente é "sem veículo escolhido", e aí não há pedágio a calcular.
   */
  readonly multiplier?: TollMultiplier | null
  /**
   * O barracão da empresa. Ausente é "esta chamada não pede a perna do barracão" — e aí a tela não
   * ganha aviso nenhum, porque ausência de pedido não é ausência de cadastro (spec 097 D2).
   */
  readonly depot?: null | ReadRouteGeometryDepotPort
  /**
   * Spec 095 D3: o veículo escolhido paga pedágio com tag? Ausente é `false` — sem saber, a conta
   * fica na base manual de sempre, nunca aplicando um desconto que ninguém confirmou.
   */
  readonly hasAutomaticTollPayment?: boolean
  /**
   * O consumo e o preço do combustível do veículo escolhido (spec 096 D1/T2). Ausente é "não sei
   * comparar" — a mesma coisa que declarar os dois campos `null`: sem eles nenhuma opção recebe o
   * rótulo de mais barata, e a razão sai em `costGap`.
   */
  readonly fuelBaseline?: null | RouteOptionVehicle
  readonly geometry: RouteGeometryPort
  readonly stops: readonly RouteGeometryPoint[]
  /**
   * O catálogo de praças. Ausente é "ninguém pediu pedágio nesta chamada" — o mapa da montagem sem
   * veículo escolhido, por exemplo — e não "a rota não passa por praça".
   */
  readonly tollBooths?: null | ReadRouteGeometryTollBoothsPort
}

const NO_FUEL_BASELINE: RouteOptionVehicle = { kilometersPerLiter: null, pricePerLiter: null }

const UNAVAILABLE_VIEW: RouteGeometryView = {
  cheapestIndex: null,
  costGap: null,
  depot: null,
  fastestIndex: null,
  hasChoice: false,
  legs: [],
  options: [],
  points: [],
  source: 'unavailable',
  toll: null,
}

/**
 * ⚠️ `unavailable` com lista vazia é o **único** jeito de dizer "não sei o caminho". Devolver as
 * próprias paradas como se fossem a estrada faria a tela desenhar retas anunciando rodovia — e uma
 * reta entre dois pontos atravessa rio, serra e ferrovia sem pedir licença.
 */
export async function readRouteGeometry(input: ReadRouteGeometryInput): Promise<RouteGeometryView> {
  /**
   * ⚠️ O barracão é resolvido **antes** do corte de duas paradas, e a ordem importa: uma entrega só
   * deixa de ser "menos de duas paradas" quando o barracão é o outro ponto — que é a rota certa.
   */
  const plan = planRouteFromDepot({
    depot: input.depot === undefined || input.depot === null ? null : await input.depot.readDepot(),
    stops: input.stops,
  })

  /**
   * ⚠️ A ausência sobrevive à rota indisponível de propósito: é justamente quando não há traçado
   * que o operador precisa saber que o barracão também está faltando (D2).
   */
  const depot: null | RouteGeometryDepot =
    input.depot === undefined || input.depot === null
      ? null
      : {
          absence: plan.absence,
          description: await input.depot.readDescription(),
          leadingLegs: plan.leadingLegs,
          origin:
            plan.origin === null
              ? null
              : {
                  latitude: plan.origin.latitude.toFixed(COORDINATE_SCALE),
                  longitude: plan.origin.longitude.toFixed(COORDINATE_SCALE),
                },
          trailingLegs: plan.trailingLegs,
        }

  if (plan.stops.length < 2) return { ...UNAVAILABLE_VIEW, depot }

  const road = await input.geometry.readRouteGeometry(plan.stops)
  if (road === null) return { ...UNAVAILABLE_VIEW, depot }

  /**
   * A principal é sempre `options[0]` (spec 096 D2/spec.md): o roteirizador manda no traço padrão,
   * a alternativa é oferta ao lado dele.
   */
  const rawRoads = [road, ...(road.alternatives ?? [])]
  const resolved = await Promise.all(
    rawRoads.map((raw) =>
      resolveOption({
        axles: input.axles ?? null,
        hasAutomaticTollPayment: input.hasAutomaticTollPayment ?? false,
        multiplier: input.multiplier ?? null,
        road: raw,
        tollBooths: input.tollBooths ?? null,
      }),
    ),
  )

  const ranking = rankRouteOptions({
    options: resolved.map((option) => ({
      distanceMeters: option.distanceMeters,
      durationSeconds: option.durationSeconds,
      tollTotal: option.toll?.total ?? null,
    })),
    vehicle: input.fuelBaseline ?? NO_FUEL_BASELINE,
  })

  const options: readonly RouteGeometryOption[] = resolved.map((option, index) => ({
    ...option,
    fuelTotal: ranking.options[index]?.fuelTotal ?? null,
    totalCost: ranking.options[index]?.totalCost ?? null,
  }))

  const primary = options[0]

  /** `rawRoads` sempre tem ao menos um elemento — `road` — então `primary` nunca falta aqui. */
  if (primary === undefined) return { ...UNAVAILABLE_VIEW, depot }

  return {
    cheapestIndex: ranking.cheapestIndex,
    costGap: ranking.costGap,
    depot,
    fastestIndex: ranking.fastestIndex,
    hasChoice: ranking.hasChoice,
    legs: primary.legs,
    options,
    points: primary.points,
    source: 'road',
    toll: primary.toll,
  }
}

/**
 * ⚠️ A simplificação é do **desenho**, e os trechos passam intactos por ela. Jogar fora ponto para
 * caber no pixel não pode encurtar a distância que o operador lê — o traço é aproximação, o número
 * não é. Cada opção desenha o próprio traço, com o próprio pedágio (spec 096 D3).
 */
async function resolveOption(input: {
  readonly axles: AxleCount | null
  readonly multiplier: TollMultiplier | null
  readonly hasAutomaticTollPayment: boolean
  readonly road: RouteGeometryRoad
  readonly tollBooths: null | ReadRouteGeometryTollBoothsPort
}): Promise<
  Readonly<{
    distanceMeters: number
    durationSeconds: number
    legs: readonly RouteGeometryLeg[]
    points: readonly { readonly latitude: string; readonly longitude: string }[]
    toll: null | RouteGeometryToll
  }>
> {
  const simplified = simplifyRouteGeometry(input.road.points, { toleranceMetres: TOLERANCE_METRES })

  return {
    distanceMeters: input.road.legs.reduce((total, leg) => total + leg.distanceMetres, 0),
    durationSeconds: input.road.legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    legs: input.road.legs,
    points: simplified.map((point) => ({
      latitude: point.latitude.toFixed(COORDINATE_SCALE),
      longitude: point.longitude.toFixed(COORDINATE_SCALE),
    })),
    toll: await resolveRouteToll({
      axles: input.axles,
      multiplier: input.multiplier,
      hasAutomaticTollPayment: input.hasAutomaticTollPayment,
      nodeIds: input.road.nodeIds,
      nodeIdsByLeg: input.road.nodeIdsByLeg,
      tollBooths: input.tollBooths,
    }),
  }
}

/**
 * Spec 090 D4: o pedágio sai dos **mesmos** nós que a chamada acima devolveu — nunca de uma segunda
 * rota, que poderia discordar da desenhada. `resolveTollRouteCost` (T5) continua sendo o único
 * lugar que soma; esta função só decide se há o que somar e junta a data da tarifa.
 */
async function resolveRouteToll(input: {
  readonly axles: AxleCount | null
  readonly multiplier: TollMultiplier | null
  readonly hasAutomaticTollPayment: boolean
  readonly nodeIds: null | readonly number[]
  /** Os mesmos nós por trecho — é deles que sai em que perna da viagem cada praça cai. */
  readonly nodeIdsByLeg: null | readonly (readonly number[])[]
  readonly tollBooths: null | ReadRouteGeometryTollBoothsPort
}): Promise<null | RouteGeometryToll> {
  if (input.axles === null || input.multiplier === null || input.tollBooths === null) return null

  const records = input.nodeIds === null ? [] : await input.tollBooths.readByNodeIds(input.nodeIds)
  /**
   * Em que trecho cada nó é cruzado. ⚠️ **O primeiro cruzamento vence**: um nó que reaparece é alça
   * de trevo ou retorno de rotatória — medido, 27 nós com 65 ocorrências extras numa rota de 89 km —,
   * e a cobrança já é uma por rota. Quem faz o par de cancelas gêmeas cair em pernas diferentes é
   * elas serem **nós diferentes**, um por sentido, não a repetição do mesmo.
   */
  const legIndexByNode = new Map<number, number>()
  for (const [legIndex, nodeIds] of (input.nodeIdsByLeg ?? []).entries()) {
    for (const nodeId of nodeIds) {
      if (!legIndexByNode.has(nodeId)) legIndexByNode.set(nodeId, legIndex)
    }
  }
  const observedOnByNode = new Map(records.map((record) => [record.osmNodeId, record.observedOn]))

  const cost = resolveTollRouteCost({
    axles: input.axles,
    booths: records,
    hasAutomaticTollPayment: input.hasAutomaticTollPayment,
    multiplier: input.multiplier,
    nodeIds: input.nodeIds,
  })
  if (cost === null) return null

  const observedDates = cost.booths
    .map((booth) => observedOnByNode.get(booth.osmNodeId))
    .filter((value): value is string => value !== undefined)
    .sort()

  return {
    ...cost,
    /** A fração vira rótulo aqui: a tela imprime `1`, `1,5`, `3` — nunca um par de inteiros. */
    multiplierLabel: formatTollMultiplier(cost.multiplier),
    booths: describeTollBoothCharges({
      booths: cost.booths,
      multiplier: cost.multiplier,
      paymentMode: cost.paymentMode,
    }).map((booth) => ({ ...booth, legIndex: legIndexByNode.get(booth.osmNodeId) ?? null })),
    tariffObservedOn: observedDates[0] ?? null,
  }
}
