/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (revisão): a leitura do modo de itens é refinamento — falhar vira mapa vazio, mas a falha
 * é registrada (sem parâmetro nem dado) e, sem logger (dentro de transação), propaga a causa.
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../src/shared/api.types.js'
import {
  listOccurrenceTypeItemsShapesOrEmpty,
  OCCURRENCE_TYPE_ITEMS_READ_FAILED_MESSAGE,
} from '../src/trips/infrastructure/occurrence-type-items-read.query.js'
import type { TripQueryable } from '../src/trips/infrastructure/trip-queryable.type.js'

type LoggedWarning = { readonly message: string; readonly metadata: unknown }

const SENSITIVE_VALUE = 'cliente-sigiloso@example.com'

function buildFailingQueryable(cause: Error): TripQueryable {
  const failure = new Error(`Failed query: select\nparams: ${SENSITIVE_VALUE}`, { cause })
  return {
    select: () => ({ from: () => ({ where: () => Promise.reject(failure) }) }),
  } as unknown as TripQueryable
}

function buildLogger(warnings: LoggedWarning[]): ApiLogger {
  return {
    error: () => undefined,
    info: () => undefined,
    warn: (message, metadata) => {
      warnings.push({ message, metadata })
    },
  }
}

const PARAMS = { companyId: 'company-1', occurrenceTypeIds: ['type-1'] } as const

describe('leitura do modo de itens que falha (spec 241)', () => {
  test('com logger: devolve mapa vazio e registra aviso só com o SQLSTATE', async () => {
    const warnings: LoggedWarning[] = []
    const pgError = Object.assign(new Error('relation does not exist'), { code: '42P01' })

    const shapes = await listOccurrenceTypeItemsShapesOrEmpty(buildFailingQueryable(pgError), {
      ...PARAMS,
      logger: buildLogger(warnings),
    })

    expect(shapes.size).toBe(0)
    expect(warnings).toEqual([
      { message: OCCURRENCE_TYPE_ITEMS_READ_FAILED_MESSAGE, metadata: { code: '42P01' } },
    ])
    expect(JSON.stringify(warnings)).not.toContain(SENSITIVE_VALUE)
  })

  test('com logger e erro sem SQLSTATE: o código é unknown', async () => {
    const warnings: LoggedWarning[] = []

    await listOccurrenceTypeItemsShapesOrEmpty(buildFailingQueryable(new Error('boom')), {
      ...PARAMS,
      logger: buildLogger(warnings),
    })

    expect(warnings).toEqual([
      { message: OCCURRENCE_TYPE_ITEMS_READ_FAILED_MESSAGE, metadata: { code: 'unknown' } },
    ])
  })

  test('sem logger (dentro de transação): a falha propaga, o .catch não esconde a causa', async () => {
    await expect(
      listOccurrenceTypeItemsShapesOrEmpty(buildFailingQueryable(new Error('boom')), PARAMS),
    ).rejects.toThrow('Failed query')
  })
})
