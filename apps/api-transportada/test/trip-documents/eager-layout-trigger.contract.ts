/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 G006: sem banco, prova por leitura de fonte que todo use case eager da D7 chama
 * `requestCargoLayoutForTrip(` dentro do próprio método — mesmo estilo do teste de paridade do
 * worker (`apps/worker-transportada/test/cargo-layout/schema-parity.contract.ts`).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const TRIP_REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-trip.repository.ts',
  import.meta.url,
)
const TRIP_ROUTE_REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-trip-route.repository.ts',
  import.meta.url,
)
const DELIVERY_ADDRESS_OVERRIDE_REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-delivery-address-override.repository.ts',
  import.meta.url,
)

const TRIGGER_CALL = 'requestCargoLayoutForTrip('

/** Cada método público é um bloco entre um `public async` e o próximo — mesma convenção nas três classes. */
function extractMethodBody(source: string, methodName: string): string {
  const chunks = source.split('\n  public async ').slice(1)
  const chunk = chunks.find((candidate) => candidate.startsWith(`${methodName}(`))
  if (chunk === undefined) throw new Error(`method not found: ${methodName}`)
  return chunk
}

describe('eager cargo layout trigger wiring (spec 145 D7/G006)', () => {
  test.each(['create', 'linkDocument', 'linkDocumentsBatch', 'releaseDocument'] as const)(
    'DrizzleTripRepository.%s requests a cargo layout recalculation inside its own transaction',
    (methodName) => {
      const source = readFileSync(TRIP_REPOSITORY, 'utf8')
      const body = extractMethodBody(source, methodName)
      expect(body).toContain(TRIGGER_CALL)
    },
  )

  test('DrizzleTripRouteRepository.reorderStops requests a cargo layout recalculation inside its own transaction', () => {
    const source = readFileSync(TRIP_ROUTE_REPOSITORY, 'utf8')
    const body = extractMethodBody(source, 'reorderStops')
    expect(body).toContain(TRIGGER_CALL)
  })

  test('DrizzleDeliveryAddressOverrideRepository.applyOverride requests a cargo layout recalculation inside its own transaction', () => {
    const source = readFileSync(DELIVERY_ADDRESS_OVERRIDE_REPOSITORY, 'utf8')
    const body = extractMethodBody(source, 'applyOverride')
    expect(body).toContain(TRIGGER_CALL)
  })
})
