/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.8 (ADR-0108, D9): o aviso "Tipo sem modelo de notificação" é calculado em lote — uma consulta
 * `IN (chaves)` por página, nunca uma por linha — e só para o que depende dela.
 */
import { describe, expect, test } from 'bun:test'

import {
  listMissingNotificationTemplates,
  listTypesWithoutUsableTemplate,
  type MailTemplateCandidate,
} from '../../src/trips/infrastructure/occurrence-mail-template-missing.query.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'

type TemplateRow = { body: string; key: string; subject: string; version: number }

function buildQueryable(rows: readonly TemplateRow[]) {
  const calls: unknown[] = []
  const queryable = {
    execute: async (query: unknown) => {
      calls.push(query)
      return rows
    },
  } as unknown as TripQueryable
  return { calls, queryable }
}

const USABLE: TemplateRow = {
  body: 'Nota {{numeroNota}}',
  key: 'usable',
  subject: 'Assunto',
  version: 1,
}
const HTML: TemplateRow = { body: '<p>html</p>', key: 'html', subject: 'Assunto', version: 1 }

function candidate(overrides: Partial<MailTemplateCandidate>): MailTemplateCandidate {
  return {
    contractorId: 'contractor-1',
    emailsContractor: true,
    id: 'occurrence-1',
    source: 'document',
    typeNotificationTemplateKey: 'usable',
    ...overrides,
  }
}

describe('o aviso de tipo sem modelo é calculado em lote (spec 271 D9)', () => {
  test('cinquenta ocorrências de várias chaves: uma consulta só', async () => {
    const { calls, queryable } = buildQueryable([USABLE, HTML])
    const candidates = Array.from({ length: 50 }, (_, index) =>
      candidate({
        id: `occurrence-${index}`,
        typeNotificationTemplateKey: ['usable', 'html', 'gone', null][index % 4] ?? null,
      }),
    )

    const missing = await listMissingNotificationTemplates(queryable, {
      candidates,
      companyId: 'company-1',
    })

    expect(calls).toHaveLength(1)
    const expected = candidates
      .filter((entry) => entry.typeNotificationTemplateKey !== 'usable')
      .map((entry) => entry.id)
    expect([...missing].toSorted()).toEqual(expected.toSorted())
  })

  test('só a ocorrência de nota, com contratante e com o e-mail ligado, depende da leitura', async () => {
    const { calls, queryable } = buildQueryable([])

    const missing = await listMissingNotificationTemplates(queryable, {
      candidates: [
        candidate({ id: 'stop', source: 'stop', typeNotificationTemplateKey: null }),
        candidate({ emailsContractor: false, id: 'email-off', typeNotificationTemplateKey: null }),
        candidate({ contractorId: null, id: 'no-contractor', typeNotificationTemplateKey: null }),
      ],
      companyId: 'company-1',
    })

    expect(missing.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  test('tipo sem chave não consulta o módulo: já é "sem modelo"', async () => {
    const { calls, queryable } = buildQueryable([])

    const missing = await listMissingNotificationTemplates(queryable, {
      candidates: [candidate({ typeNotificationTemplateKey: null })],
      companyId: 'company-1',
    })

    expect([...missing]).toEqual(['occurrence-1'])
    expect(calls).toHaveLength(0)
  })

  test('o editor do tipo: só com o e-mail ligado, e também numa consulta só', async () => {
    const { calls, queryable } = buildQueryable([USABLE])

    const missing = await listTypesWithoutUsableTemplate(queryable, {
      companyId: 'company-1',
      types: [
        { emailsContractor: true, id: 'with-template', key: 'usable' },
        { emailsContractor: true, id: 'without-key', key: null },
        { emailsContractor: true, id: 'gone', key: 'gone' },
        { emailsContractor: false, id: 'email-off', key: null },
      ],
    })

    expect([...missing].toSorted()).toEqual(['gone', 'without-key'])
    expect(calls).toHaveLength(1)
  })
})
