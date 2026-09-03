/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { TripDocumentNotReachableError } from '../../src/trips/domain/trip.error.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const ACTOR = '00000000-0000-4000-8000-00000000000f'

function repository(reachable: boolean) {
  const calls: object[] = []
  return {
    calls,
    port: {
      async findReachableDocument(query: object) {
        calls.push(query)
        return reachable ? { tripId: '00000000-0000-4000-8000-000000000011' } : null
      },
      async saveOccurrence(saved: { readonly type: string }) {
        return {
          createdAt: '2026-09-03T12:00:00.000Z',
          id: '00000000-0000-4000-8000-0000000000d1',
          note: '',
          productCode: '',
          stage: 'delivery' as const,
          type: saved.type as never,
        }
      },
    },
  }
}

describe('o motorista registra ocorrência pelo celular (spec 079)', () => {
  /**
   * ⚠️ **O escopo é a viagem ativa dele, e é a consulta que o garante** — não a permissão. Uma nota
   * de outra viagem responde como inexistente, do mesmo jeito que o comprovante já faz: o motorista
   * tem `trip.report` para toda a empresa, e é o `driverId` na junção que estreita isso à carga que
   * ele está levando.
   */
  test('a busca leva o motorista, e nota fora da viagem dele é inalcançável', async () => {
    const { calls, port } = repository(false)

    const error = await registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      note: '',
      repository: port,
      type: 'recusa_total',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentNotReachableError)
    expect(calls).toEqual([{ companyId: COMPANY, documentId: DOCUMENT, driverId: DRIVER }])
  })

  /**
   * ⚠️ **O motorista registra só o que acontece na rua.** `item_faltante` é do galpão — ele não
   * separou a carga, e aceitar isso dele apagaria a linha que a ADR-0043 traçou entre barracão e
   * rua, a mesma que decide quem pode o quê.
   */
  test('recusa tipo de separação', async () => {
    const error = await registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      note: '',
      repository: repository(true).port,
      type: 'item_faltante',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentNotReachableError)
  })

  test('registra o tipo de rua na nota que ele está levando', async () => {
    const saved = await registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      note: 'Portão fechado',
      repository: repository(true).port,
      type: 'destinatario_ausente',
    })

    expect(saved.type).toBe('destinatario_ausente')
    expect(saved.stage).toBe('delivery')
  })
})
