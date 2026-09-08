/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O barracão no traçado da viagem (spec 097).
 *
 * O caminhão sai do galpão, e até esta spec essa perna não existia em conta nenhuma da montagem:
 * nem distância, nem tempo, nem combustível, nem pedágio. Medido em 2026-09-08 contra o OSRM local,
 * com o barracão real desta base e três notas de uma viagem de verdade: **48,3 km / 39 min** como a
 * tela mostrava, **105,3 km / 86 min** com o barracão na origem, **208,3 km / 165 min** na ida e
 * volta. A praça de pedágio que faltava mora justamente na perna do barracão — a tela dizia "sem
 * pedágio" numa viagem de R$ 30,00 —, e todo o erro era **para baixo**, a direção que faz aceitar
 * carga que não paga.
 *
 * ⚠️ **A regra é a do solver, não uma segunda escrita aqui.** `company_route_optimization_settings`
 * já guarda a origem e a política de fim, e `drizzle-route-optimization.repository.ts` (worker) já
 * as lê para "Propor ordem" e "Melhor rota". Uma segunda regra na montagem recriaria exatamente a
 * divergência que este defeito é.
 */
import type { RouteEndPolicy } from '../../database/route-suggestion.schema.js'
import type { RouteGeometryPoint } from './route-geometry.policy.js'

/**
 * Por que a perna do barracão ficou de fora. As duas razões são distintas na tela porque o remédio
 * é distinto: uma pede cadastro do endereço, a outra pede que a geocodificação alcance esse
 * endereço.
 */
export const ROUTE_DEPOT_ABSENCES = ['not_configured', 'not_geocoded'] as const
export type RouteDepotAbsence = (typeof ROUTE_DEPOT_ABSENCES)[number]

/**
 * O barracão resolvido, ou a razão de ele não ter sido.
 *
 * `end` já vem decidido pela política de fim configurada — `null` é "a rota termina na última
 * entrega". Resolver a política aqui em vez de carregá-la adiante é o que mantém o caminho da
 * montagem sem nenhuma constante de política dentro dele.
 */
export type RouteDepot =
  | Readonly<{
      end: null | RouteGeometryPoint
      origin: RouteGeometryPoint
      status: 'resolved'
    }>
  | Readonly<{ reason: RouteDepotAbsence; status: 'absent' }>

export type RouteDepotPlan = Readonly<{
  /**
   * Por que a perna ficou de fora. `null` quando ela entrou **e** quando ninguém pediu barracão
   * nesta chamada — ausência de pedido não é ausência de barracão, e um aviso ali seria ruído.
   */
  absence: null | RouteDepotAbsence
  /** Quantos trechos do começo de `legs` são a saída do barracão: 0 ou 1. */
  leadingLegs: number
  /**
   * Onde o barracão está — a **mesma** coordenada que entrou no traçado, publicada para o mapa
   * marcar o ponto de partida com forma própria (D4). `null` quando a perna não entrou: sem
   * barracão resolvido não há origem, e inventar uma é o que a D2 proíbe.
   */
  origin: null | RouteGeometryPoint
  stops: readonly RouteGeometryPoint[]
  /** Quantos trechos do fim de `legs` são o retorno ao ponto de término: 0 ou 1. */
  trailingLegs: number
}>

const WITHOUT_DEPOT = { leadingLegs: 0, origin: null, trailingLegs: 0 } as const

/**
 * A lista de pontos que vai ao roteirizador, com o barracão na frente e o retorno no fim quando a
 * configuração manda voltar.
 *
 * ⚠️ **Barracão sem coordenada não vira ponto inventado** (D2): a rota volta a ser a de hoje e a
 * razão sobe junto, porque é ela que a tela imprime. Um custo silenciosamente incompleto é o que
 * esta feature existe para acabar.
 */
export function planRouteFromDepot(input: {
  readonly depot: null | RouteDepot
  readonly stops: readonly RouteGeometryPoint[]
}): RouteDepotPlan {
  const { depot, stops } = input

  if (depot === null) return { absence: null, stops, ...WITHOUT_DEPOT }
  if (depot.status === 'absent') return { absence: depot.reason, stops, ...WITHOUT_DEPOT }

  /**
   * ⚠️ Sem entrega nenhuma não há viagem, e uma rota barracão→barracão seria quilometragem
   * anunciada para uma viagem que não existe.
   */
  if (stops.length === 0) return { absence: null, stops, ...WITHOUT_DEPOT }

  return {
    absence: null,
    leadingLegs: 1,
    origin: depot.origin,
    stops: [depot.origin, ...stops, ...(depot.end === null ? [] : [depot.end])],
    trailingLegs: depot.end === null ? 0 : 1,
  }
}

/**
 * Onde a rota termina, pela política configurada — a mesma leitura de
 * `drizzle-route-optimization.repository.ts` no worker. `null` é "termina na última entrega".
 *
 * Este é o **único** lugar do produto que interpreta o valor de `end_policy` para a montagem, e é
 * por isso que ele é uma função pura: as três políticas são provadas em contrato, e nenhum outro
 * arquivo do caminho da montagem precisa nomear política nenhuma.
 */
export function resolveRouteEndAddressKey(settings: {
  readonly endAddressKey: string
  readonly endPolicy: RouteEndPolicy
  readonly originAddressKey: string
}): null | string {
  const key =
    settings.endPolicy === 'last_stop'
      ? ''
      : settings.endPolicy === 'address'
        ? settings.endAddressKey
        : settings.originAddressKey

  /** Chave vazia é o "não cadastrado" desta tabela: as duas colunas nascem `''`. */
  return key === '' ? null : key
}
