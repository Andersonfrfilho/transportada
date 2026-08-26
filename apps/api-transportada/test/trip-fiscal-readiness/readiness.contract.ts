/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  readTripFiscalReadiness,
  type TripDocumentReadiness,
  type TripFiscalReadinessPort,
} from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000002'

function document(
  reason: TripDocumentReadiness['reason'],
  overrides: Partial<TripDocumentReadiness> = {},
): TripDocumentReadiness {
  return {
    cteAccessKey: reason === 'ok' ? '1'.repeat(44) : null,
    reason,
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: crypto.randomUUID(),
    ...overrides,
  }
}

function buildRepository(input: {
  readonly documents?: readonly TripDocumentReadiness[] | null
  readonly hasLiveManifest?: boolean
}): TripFiscalReadinessPort {
  return {
    hasLiveManifest: () => Promise.resolve(input.hasLiveManifest ?? false),
    readDocumentReadiness: () =>
      Promise.resolve(input.documents === undefined ? [] : input.documents),
  }
}

function read(repository: TripFiscalReadinessPort) {
  return readTripFiscalReadiness({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })
}

describe('a prontidão fiscal da viagem', () => {
  it('é ready quando toda nota tem CT-e autorizado', async () => {
    const snapshot = await read(buildRepository({ documents: [document('ok'), document('ok')] }))

    expect(snapshot).toMatchObject({ readyCount: 2, state: 'ready', totalCount: 2 })
  })

  /** "Não está pronta" manda abrir outra tela; "a nota X foi rejeitada" é o que se resolve. */
  it('diz por nota o que falta, e não só que falta', async () => {
    const snapshot = await read(
      buildRepository({
        documents: [
          document('ok'),
          document('no_cte'),
          document('cte_in_progress'),
          document('cte_rejected', { rejectionCode: '539', rejectionMessage: 'Duplicidade' }),
        ],
      }),
    )

    expect(snapshot).toMatchObject({ readyCount: 1, state: 'incomplete', totalCount: 4 })
    expect(snapshot.documents.map((entry) => entry.reason)).toEqual([
      'ok',
      'no_cte',
      'cte_in_progress',
      'cte_rejected',
    ])
    expect(snapshot.documents[3]).toMatchObject({ rejectionCode: '539' })
  })

  /** CT-e cancelado é o caso que uma flag booleana perderia — e manifestar sobre ele é declarar o inexistente. */
  it('CT-e cancelado bloqueia', async () => {
    const snapshot = await read(buildRepository({ documents: [document('cte_cancelled')] }))

    expect(snapshot.state).toBe('incomplete')
  })

  /** Não existe manifesto vazio: `ready` aqui faria o consumer emitir um MDF-e sem CT-e dentro. */
  it('viagem sem nota nenhuma não é pronta', async () => {
    const snapshot = await read(buildRepository({ documents: [] }))

    expect(snapshot).toMatchObject({ readyCount: 0, state: 'incomplete', totalCount: 0 })
  })

  it('viagem com manifesto vivo e tudo em ordem é manifested', async () => {
    const snapshot = await read(
      buildRepository({ documents: [document('ok')], hasLiveManifest: true }),
    )

    expect(snapshot.state).toBe('manifested')
  })

  /**
   * O caso da P2 da spec: o manifesto foi autorizado e depois um CT-e foi cancelado. O sistema
   * **não** cancela o manifesto sozinho — isso é decisão fiscal humana. Ele deixa de ser silencioso.
   */
  it('manifesto vivo sobre nota que deixou de estar pronta é divergente', async () => {
    const snapshot = await read(
      buildRepository({
        documents: [document('ok'), document('cte_cancelled')],
        hasLiveManifest: true,
      }),
    )

    expect(snapshot.state).toBe('divergent')
  })

  it('viagem de outra empresa não é encontrada', async () => {
    const attempt = read(buildRepository({ documents: null }))

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
  })
})
