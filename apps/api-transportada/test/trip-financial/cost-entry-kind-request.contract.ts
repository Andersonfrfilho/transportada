/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 RF5: o gasto migra para o cadastro de espécies. `kind` continua aceito sozinho
 * (compatibilidade), mas nunca junto com `entryKindId` — um mandaria o outro calado.
 */
import { describe, expect, test } from 'bun:test'

import { parseTripCostRequest } from '../../src/trips/presentation/trip-financial.schema.js'
import { ApiError } from '../../src/shared/api.error.js'

const COSTS_URL = 'https://api.local/trips/00000000-0000-4000-8000-000000000a11/costs'
const ENTRY_KIND_ID = '00000000-0000-4000-8000-0000000000e1'

function costRequest(body: Record<string, unknown>): Request {
  return new Request(COSTS_URL, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('o corpo do lançamento de gasto aceita kind OU entryKindId (spec 169 RF5)', () => {
  test('entryKindId sozinho é aceito', async () => {
    const parsed = await parseTripCostRequest(
      costRequest({ amount: '10.0000', description: '', entryKindId: ENTRY_KIND_ID }),
    )

    expect(parsed.entryKindId).toBe(ENTRY_KIND_ID)
    expect(parsed.kind).toBeUndefined()
  })

  test('kind sozinho continua aceito (compatibilidade)', async () => {
    const parsed = await parseTripCostRequest(
      costRequest({ amount: '10.0000', description: '', kind: 'toll' }),
    )

    expect(parsed.kind).toBe('toll')
    expect(parsed.entryKindId).toBeUndefined()
  })

  test('os dois juntos são recusados — um mandaria o outro calado', async () => {
    const attempt = parseTripCostRequest(
      costRequest({ amount: '10.0000', description: '', entryKindId: ENTRY_KIND_ID, kind: 'toll' }),
    )

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
  })

  test('nenhum dos dois é recusado', async () => {
    const attempt = parseTripCostRequest(costRequest({ amount: '10.0000', description: '' }))

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
  })
})
