/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T103: a chamada `exclude=toll` entra **em paralelo** com a de sempre — nenhuma espera a
 * outra —, e o resultado das duas se junta numa lista de candidatas deduplicada por assinatura
 * (T102), com a marca de quem é sem pedágio. `options[].signature`/`selectedIndex` continuam de
 * fora: esta função só entrega estradas, quem vira `RouteGeometryOption` é a T104.
 */
import { buildRouteSignature } from '../domain/route-choice.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { RouteGeometryPort, RouteGeometryRoad } from './route-geometry.port.js'

const TOLL_FREE_EXCLUDE_UNSUPPORTED_EVENT = 'trip_route_geometry_exclude_toll_unsupported'

type RouteGeometryTollFreeLogger = Readonly<{
  warn(message: string, metadata?: Record<string, unknown>): void
}>

const NO_OP_LOGGER: RouteGeometryTollFreeLogger = { warn: () => {} }

/**
 * Quem já avisou, **por instância de logger**, não um `boolean` solto no módulo. Em produção há um
 * logger só para o processo inteiro, então o efeito é exatamente "uma vez por processo" (spec.md
 * linha 144); em teste, cada logger novo é uma chave nova no `WeakSet`, e o aviso de um contrato
 * não vaza para o outro nem depende da ordem em que rodam — sem precisar de um `reset` exportado só
 * para teste.
 */
const warnedLoggers = new WeakSet<RouteGeometryTollFreeLogger>()

/** Uma estrada candidata, com a identidade e a marca de sem pedágio que a T104 vai consumir. */
export type RouteGeometryTollFreeCandidate = Readonly<{
  road: RouteGeometryRoad
  isNoToll: boolean
  signature: null | string
}>

/**
 * Junta a rota de sempre com a rota sem pedágio numa lista só de candidatas.
 *
 * ⚠️ **A principal é a âncora.** Sem ela (falha ou `null`) não há o que oferecer ao lado — spec 096
 * D2, a alternativa é oferta, nunca troca automática —, então a lista sai vazia mesmo que a chamada
 * sem pedágio tenha dado certo.
 *
 * ⚠️ **Assinatura nula nunca deduplica**, nem contra si mesma: hash do vazio daria a mesma
 * identidade a toda rota sem anotação de nó (T102 recusa essa colisão), então uma rota sem pedágio
 * sem assinatura sempre vira candidata nova.
 */
export async function readRouteGeometryTollFreeCandidates(input: {
  readonly geometry: RouteGeometryPort
  readonly logger?: RouteGeometryTollFreeLogger
  readonly points: readonly RouteGeometryPoint[]
}): Promise<readonly RouteGeometryTollFreeCandidate[]> {
  const { geometry, points } = input
  const logger = input.logger ?? NO_OP_LOGGER

  const [normalResult, tollFreeResult] = await Promise.allSettled([
    geometry.readRouteGeometry(points),
    geometry.readRouteGeometry(points, { excludeToll: true }),
  ])

  const principal = normalResult.status === 'fulfilled' ? normalResult.value : null
  if (principal === null) return []

  const candidates = [principal, ...(principal.alternatives ?? [])].map(toCandidate)

  const tollFreeRoad = tollFreeResult.status === 'fulfilled' ? tollFreeResult.value : null
  if (tollFreeRoad === null) {
    warnExcludeTollUnsupportedOnce(logger)
    return candidates
  }

  return mergeTollFreeRoad(candidates, tollFreeRoad)
}

/**
 * ⚠️ **A chamada `exclude=toll` falhando isolada, com a principal em pé, é o sinal de perfil OSRM
 * sem `excludable`** (spec.md linha 144) — se o serviço estivesse fora do ar, a principal também
 * teria falhado, e aí a lista já sai vazia antes de chegar aqui. Sem este aviso, uma instalação sem
 * `excludable` para de oferecer rota sem pedágio para sempre, e nada avisa ninguém — o defeito
 * silencioso que esta spec existe para matar.
 */
function warnExcludeTollUnsupportedOnce(logger: RouteGeometryTollFreeLogger): void {
  if (warnedLoggers.has(logger)) return
  warnedLoggers.add(logger)
  logger.warn(TOLL_FREE_EXCLUDE_UNSUPPORTED_EVENT)
}

function toCandidate(road: RouteGeometryRoad): RouteGeometryTollFreeCandidate {
  return {
    isNoToll: false,
    road,
    signature: buildRouteSignature({ nodeIdsByLeg: road.nodeIdsByLeg }),
  }
}

/**
 * A rota sem pedágio que casa com uma candidata existente **marca essa candidata** em vez de
 * duplicá-la — é o que preserva `isNoToll: true` numa estrada que respondeu às duas chamadas.
 */
function mergeTollFreeRoad(
  candidates: readonly RouteGeometryTollFreeCandidate[],
  tollFreeRoad: RouteGeometryRoad,
): readonly RouteGeometryTollFreeCandidate[] {
  const signature = buildRouteSignature({ nodeIdsByLeg: tollFreeRoad.nodeIdsByLeg })
  const matchIndex =
    signature === null ? -1 : candidates.findIndex((candidate) => candidate.signature === signature)

  if (matchIndex === -1) {
    return [...candidates, { isNoToll: true, road: tollFreeRoad, signature }]
  }

  return candidates.map((candidate, index) =>
    index === matchIndex ? { ...candidate, isNoToll: true } : candidate,
  )
}
