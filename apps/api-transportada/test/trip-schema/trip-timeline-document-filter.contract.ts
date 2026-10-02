/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T5.1 (D7): o filtro por nota é aplicado no SQL das fontes que carregam nota, e a conferência
 * de que a nota é da viagem e da empresa do contexto ancora as duas chaves. Lê a fonte, no molde de
 * `trip-timeline-query-tenant-safety.contract.ts`; a prova de comportamento contra o banco está em
 * `test/integration/trip-timeline.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const STOP_SOURCE = readSource('../../src/trips/infrastructure/trip-timeline-stop.query.ts')
const DOCUMENT_SOURCE = readSource('../../src/trips/infrastructure/trip-timeline-document.query.ts')
const ORCHESTRATOR_SOURCE = readSource('../../src/trips/infrastructure/trip-timeline.query.ts')
const STATUS_SOURCE = readSource('../../src/trips/infrastructure/trip-timeline-status.query.ts')

describe('filtro por nota da linha do tempo (spec 227 T5.1)', () => {
  test('eventos de parada deixam passar o que não tem nota e filtram o que tem', () => {
    expect(STOP_SOURCE).toContain('isNull(tripStopEvents.tripDocumentId)')
    expect(STOP_SOURCE).toContain('eq(tripStopEvents.tripDocumentId, params.documentId)')
  })

  test('ocorrência e troca de status da nota filtram pela própria nota', () => {
    expect(DOCUMENT_SOURCE).toContain('eq(tripDocuments.id, params.documentId)')
    expect(DOCUMENT_SOURCE.match(/eq\(tripDocuments\.id, params\.documentId\)/gu)).toHaveLength(2)
  })

  test('as fontes sem nota (viagem e ocorrência de parada) não ganham o filtro', () => {
    expect(STATUS_SOURCE).not.toContain('documentId')
    const stopOccurrenceSource = STOP_SOURCE.split(
      'export async function listStopOccurrenceRows',
    )[1]
    expect(stopOccurrenceSource).toBeDefined()
    expect(stopOccurrenceSource).not.toContain('documentId')
  })

  test('a nota é conferida pela empresa e pela viagem, não só pelo id', () => {
    expect(ORCHESTRATOR_SOURCE).toContain('findTripDocumentScope')
    expect(ORCHESTRATOR_SOURCE).toContain('eq(tripDocuments.companyId, input.companyId)')
    expect(ORCHESTRATOR_SOURCE).toContain('eq(tripDocuments.tripId, input.tripId)')
    expect(ORCHESTRATOR_SOURCE).toContain('eq(tripDocuments.id, input.documentId)')
  })
})
