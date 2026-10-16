/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (revisão): o aviso "Tipo sem modelo de notificação" é refinamento do feed — falhar vira "ninguém sem
 * modelo", mas a falha é registrada (sem parâmetro nem dado) e, sem logger (dentro de transação), propaga a causa.
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../src/shared/api.types.js'
import {
  listMissingNotificationTemplatesOrEmpty,
  OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE,
} from '../src/trips/infrastructure/occurrence-mail-template-missing.query.js'
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

const PARAMS = {
  candidates: [
    {
      contractorId: 'contractor-1',
      emailsContractor: true,
      id: 'occurrence-1',
      occurrenceTypeId: 'type-1',
      source: 'document',
      typeMailTemplateId: null,
    },
  ],
  companyId: 'company-1',
} as const

describe('leitura do aviso de tipo sem modelo que falha (spec 269)', () => {
  test('com logger: devolve conjunto vazio e registra aviso só com o SQLSTATE', async () => {
    const warnings: LoggedWarning[] = []
    const pgError = Object.assign(new Error('relation does not exist'), { code: '42P01' })

    const missing = await listMissingNotificationTemplatesOrEmpty(buildFailingQueryable(pgError), {
      ...PARAMS,
      logger: buildLogger(warnings),
    })

    expect(missing.size).toBe(0)
    expect(warnings).toEqual([
      {
        message: OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE,
        metadata: { code: '42P01' },
      },
    ])
    expect(JSON.stringify(warnings)).not.toContain(SENSITIVE_VALUE)
  })

  test('sem logger (dentro de transação): a falha propaga, o .catch não esconde a causa', async () => {
    await expect(
      listMissingNotificationTemplatesOrEmpty(buildFailingQueryable(new Error('boom')), PARAMS),
    ).rejects.toThrow('Failed query')
  })

  test('sem candidato que dependa da leitura, nem consulta o banco', async () => {
    const missing = await listMissingNotificationTemplatesOrEmpty(
      buildFailingQueryable(new Error('boom')),
      { ...PARAMS, candidates: [] },
    )

    expect(missing.size).toBe(0)
  })
})
