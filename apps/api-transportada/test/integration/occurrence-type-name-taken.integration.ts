/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4a (ADR-0094 §9.5, achado de implementação): o nome do tipo é único por empresa em
 * QUALQUER etapa, e o cadastro do painel não lista o tipo de recebimento. Criar ou renomear um tipo
 * de viagem com o nome de um tipo de recebimento escondido é 409 com código estável — não 500.
 */
import { describe, expect, test } from 'bun:test'

import { withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import { hasTestDatabase } from '../fixtures/cargo-arrival-damaged.fixture.js'
import { seedOccurrenceType } from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const HIDDEN_NAME = 'Item avariado na chegada'

type SaveInput = Parameters<typeof saveOccurrenceType>[1]

function values(overrides: Partial<SaveInput>): SaveInput {
  return {
    active: true,
    allowsMultipleItems: true,
    companyId: COMPANY_CONTEXT.companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    name: 'Caixa molhada',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
    ...overrides,
  }
}

describe('o nome do tipo de ocorrência é único em qualquer etapa (spec 237 T3.4a)', () => {
  testWithPostgres(
    'criar com o nome de um tipo de recebimento escondido é 409, ignorando caixa e espaços',
    async () => {
      await withCargoDatabase(async (database) => {
        await seedOccurrenceType(database, { name: HIDDEN_NAME, stage: 'receiving' })

        await expect(
          saveOccurrenceType(database.db, values({ name: `  ${HIDDEN_NAME.toUpperCase()} ` })),
        ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_NAME_TAKEN', status: 409 })
        const created = await saveOccurrenceType(database.db, values({ name: 'Caixa molhada' }))
        expect(created.name).toBe('Caixa molhada')
      })
    },
  )

  testWithPostgres('renomear para o nome de um tipo de recebimento escondido é 409', async () => {
    await withCargoDatabase(async (database) => {
      await seedOccurrenceType(database, { name: HIDDEN_NAME, stage: 'receiving' })
      const existing = await saveOccurrenceType(database.db, values({ name: 'Caixa molhada' }))

      await expect(
        saveOccurrenceType(
          database.db,
          values({ name: HIDDEN_NAME, occurrenceTypeId: existing.id }),
        ),
      ).rejects.toMatchObject({ code: 'OCCURRENCE_TYPE_NAME_TAKEN', status: 409 })
    })
  })
})
