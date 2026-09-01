/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { solveRoute } from '../domain/route-solver.js'
import { runRouteOptimization } from '../application/route-optimization.effect.js'
import type { RouteOptimizationHandlerPorts } from '../application/route-optimization-handler.service.js'
import type { RoutingMatrixPort } from '../application/routing-matrix.port.js'
import type { RouteOptimizationRepository } from './drizzle-route-optimization.repository.js'

/**
 * Junta as três peças que já existem e são testadas em separado — repositório, matriz e solver — na
 * forma que o handler consome. Não decide nada: a regra de repetir está no handler, a de otimizar
 * está no efeito, e a de resolver está no solver.
 */
export function createRouteOptimizationPorts(input: {
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
        context,
        ports: { matrix: input.matrix, solve: solveRoute },
      })
    },
  }
}
