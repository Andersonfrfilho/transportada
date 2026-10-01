/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 D2 (evidence.md, Fase 4b, "Limites que ficam"): a rota do motorista já aceita
 * `occurrenceTypeId` no lugar de `kind` — a do escritório em nome dele, não. As duas gravam na
 * mesma tabela (`trip_stop_occurrences`), pelo mesmo `reportStopOccurrence`; sem este corpo, o
 * escritório nunca grava `occurrence_type_id`, e a sugestão de cobrança/aviso caem sempre no
 * legado (`kind` cru), nunca no `stop_kind` do tipo escolhido pelo operador.
 */
import { describe, expect, test } from 'bun:test'

import { parseOfficeStopOccurrenceRequest } from '../../src/trips/presentation/trip-field-office.schema.js'

const CHARGE_TYPE_ID = '00000000-0000-4000-8000-0000000000c1'

function request(body: unknown): Request {
  return new Request('http://localhost/trips/x/stops/y/occurrences', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('o corpo da ocorrência de parada do escritório aceita o tipo do catálogo (spec 218 D2)', () => {
  test('occurrenceTypeId entra no lugar de kind', async () => {
    const parsed = await parseOfficeStopOccurrenceRequest(
      request({ occurrenceTypeId: CHARGE_TYPE_ID }),
    )

    expect(parsed.occurrenceTypeId).toBe(CHARGE_TYPE_ID)
    expect(parsed.kind).toBeUndefined()
  })

  test('o corpo antigo, com kind, continua valendo', async () => {
    const parsed = await parseOfficeStopOccurrenceRequest(request({ kind: 'long_wait' }))

    expect(parsed.kind).toBe('long_wait')
    expect(parsed.occurrenceTypeId).toBeUndefined()
  })

  test('driverId continua aceito ao lado de qualquer um dos dois', async () => {
    const parsed = await parseOfficeStopOccurrenceRequest(
      request({
        driverId: '00000000-0000-4000-8000-000000000003',
        occurrenceTypeId: CHARGE_TYPE_ID,
      }),
    )

    expect(parsed.driverId).toBe('00000000-0000-4000-8000-000000000003')
  })

  test('os dois juntos, ou nenhum dos dois, é 400', async () => {
    for (const body of [{ kind: 'long_wait', occurrenceTypeId: CHARGE_TYPE_ID }, {}]) {
      const rejected = await parseOfficeStopOccurrenceRequest(request(body)).catch(
        (error: unknown) => error,
      )
      expect((rejected as { status?: number }).status).toBe(400)
    }
  })
})
