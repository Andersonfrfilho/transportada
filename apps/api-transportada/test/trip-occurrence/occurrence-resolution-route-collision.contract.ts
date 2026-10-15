/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.3: o roteador entrega a primeira rota dinâmica que casa. `/trip-occurrences/:kind/:id/resolution`
 * convive com dezenas de rotas `/trip-occurrences/:id/...`; nenhum par do mesmo método pode casar o
 * mesmo caminho concreto, ou uma das duas deixaria de ser alcançável sem erro algum.
 */
import { describe, expect, it } from 'bun:test'

import { createOccurrenceAutomaticMailRoutes } from '../../src/occurrence-conversation/presentation/occurrence-automatic-mail.routes.js'
import { createOccurrenceContractorReplyRoutes } from '../../src/occurrence-conversation/presentation/occurrence-contractor-reply.routes.js'
import { createOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes.js'
import { createOccurrenceCaseRoutes } from '../../src/trips/presentation/occurrence-case.routes.js'
import { createOccurrenceResolutionRoutes } from '../../src/trips/presentation/occurrence-resolution.routes.js'
import { createOccurrenceSettlementRoutes } from '../../src/trips/presentation/occurrence-settlement.routes.js'
import { createRedeliveryApplicationRoutes } from '../../src/trips/presentation/redelivery-application.routes.js'
import { createRedeliveryProposalRoutes } from '../../src/trips/presentation/redelivery-proposal.routes.js'
import { createTripOccurrenceDetailRoutes } from '../../src/trips/presentation/trip-occurrence-detail.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

type RouteShape = { readonly method: string; readonly pathname: string }

function anyDependencies<TDependencies>(): TDependencies {
  const handler: ProxyHandler<() => void> = { get: () => new Proxy(() => undefined, handler) }
  return new Proxy(() => undefined, handler) as unknown as TDependencies
}

function collectTripOccurrenceRoutes(): readonly RouteShape[] {
  const routes: readonly RouteShape[] = [
    ...createOccurrenceAutomaticMailRoutes(anyDependencies()),
    ...createOccurrenceCaseRoutes(anyDependencies()),
    ...createOccurrenceContractorReplyRoutes(anyDependencies()),
    ...createOccurrenceConversationRoutes(anyDependencies()),
    ...createOccurrenceResolutionRoutes(anyDependencies()),
    ...createOccurrenceSettlementRoutes(anyDependencies()),
    ...createRedeliveryApplicationRoutes(anyDependencies()),
    ...createRedeliveryProposalRoutes(anyDependencies()),
    ...createTripOccurrenceDetailRoutes(anyDependencies()),
    ...createTripRoutes(anyDependencies()),
  ]
  return routes.filter((route) => route.pathname.startsWith('/trip-occurrences'))
}

function segmentsCollide(first: string, second: string): boolean {
  const firstSegments = first.split('/')
  const secondSegments = second.split('/')
  if (firstSegments.length !== secondSegments.length) return false
  return firstSegments.every((segment, index) => {
    const other = secondSegments[index]
    return segment.startsWith(':') || other?.startsWith(':') === true || segment === other
  })
}

describe('colisão de rotas /trip-occurrences (spec 266 T2.3)', () => {
  it('a rota de resolução está entre as coletadas', () => {
    expect(
      collectTripOccurrenceRoutes().some(
        (route) =>
          route.method === 'POST' && route.pathname === '/trip-occurrences/:kind/:id/resolution',
      ),
    ).toBe(true)
  })

  it('nenhum par de rotas do mesmo método e de pathnames diferentes casa o mesmo caminho', () => {
    const routes = collectTripOccurrenceRoutes()
    const collisions: string[] = []
    routes.forEach((first, index) => {
      for (const second of routes.slice(index + 1)) {
        if (first.method !== second.method || first.pathname === second.pathname) continue
        if (segmentsCollide(first.pathname, second.pathname)) {
          collisions.push(`${first.method} ${first.pathname} x ${second.pathname}`)
        }
      }
    })
    expect(collisions).toEqual([])
  })
})
