/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { solveRoute } from '../domain/route-solver.js'
import { runRouteOptimization } from '../application/route-optimization.effect.js'
import type { RouteOptimizationContext } from '../application/route-optimization.effect.js'
import { geocodeAddresses } from '../application/geocode-address.use-case.js'
import type { CentroidPort } from '../application/geocode-address.use-case.js'
import type { GeocodedAddressRepository, GeocodingPort } from '../application/geocoding.port.js'
import {
  applyResolvedCoordinates,
  buildGeocodeRequests,
} from '../application/resolve-stop-coordinates.use-case.js'
import type { RouteOptimizationHandlerPorts } from '../application/route-optimization-handler.service.js'
import type { RoutingMatrixPort } from '../application/routing-matrix.port.js'
import type { RouteOptimizationRepository } from './drizzle-route-optimization.repository.js'

/**
 * Junta as três peças que já existem e são testadas em separado — repositório, matriz e solver — na
 * forma que o handler consome. Não decide nada: a regra de repetir está no handler, a de otimizar
 * está no efeito, e a de resolver está no solver.
 */
export type RouteOptimizationGeocoding = Readonly<{
  centroids: CentroidPort
  geocoding: GeocodingPort
  repository: GeocodedAddressRepository
}>

export function createRouteOptimizationPorts(input: {
  /**
   * Opcional para não quebrar quem monta as portas sem ela — mas **ausente é sugestão sem paradas**:
   * sem coordenada toda parada fica `excludedFromOptimization`, e o solver corre sobre nada. Era o
   * estado do produto até a spec 069.
   */
  readonly geocoding?: RouteOptimizationGeocoding
  readonly matrix: RoutingMatrixPort
  readonly repository: RouteOptimizationRepository
}): RouteOptimizationHandlerPorts {
  return {
    claim: (job) => input.repository.claim(job),
    complete: (completion) => input.repository.complete(completion),
    fail: (failure) => input.repository.fail(failure),
    release: (job) => input.repository.release(job),

    async optimize({ job }) {
      const context = await input.repository.readContext(job)
      /**
       * Contexto ausente é sugestão sem viagem — apagada entre a reserva e a leitura. Falhar aqui é
       * o certo: o handler a marca `failed`, e ela não fica `running` para sempre.
       */
      if (context === null) throw new Error('route optimization context is gone')

      return runRouteOptimization({
        context: { ...context, stops: await resolveStops(input.geocoding, context.stops) },
        ports: { matrix: input.matrix, solve: solveRoute },
      })
    },
  }
}

/**
 * A geocodificação acontece **entre reservar a sugestão e pedir a matriz**, e não num trilho próprio
 * (adendo 2026-09-01 da ADR-0044): um trilho separado adiaria a coordenada para depois do pedido, e
 * a primeira sugestão de uma viagem nova sairia sem paradas — que é o defeito que a spec 069 veio
 * consertar, com outro nome.
 *
 * O que a rotina de população adianta, esta chamada não repete: `geocodeAddresses` lê a base antes
 * de resolver, e endereço já visto não custa nada.
 */
async function resolveStops(
  geocoding: RouteOptimizationGeocoding | undefined,
  stops: RouteOptimizationContext['stops'],
): Promise<RouteOptimizationContext['stops']> {
  if (geocoding === undefined) return stops

  const requests = buildGeocodeRequests(stops)
  if (requests.length === 0) return stops

  const { byAddressKey } = await geocodeAddresses(
    {
      centroids: geocoding.centroids,
      geocoding: geocoding.geocoding,
      repository: geocoding.repository,
    },
    requests,
  )

  return applyResolvedCoordinates({ resolved: byAddressKey, stops })
}
