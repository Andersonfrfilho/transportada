/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4a (code-standart §15): a foto é dado secundário da leitura da avaria — a assinatura da
 * URL falhando não derruba a lista nem a marcação "devolver ao contratante" (500), e o defeito fica no
 * log estruturado, sem dado pessoal.
 */
import { describe, expect, test } from 'bun:test'

import { withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import { hasTestDatabase, seedDamaged } from '../fixtures/cargo-arrival-damaged.fixture.js'
import { createOccurrenceHandler } from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip

describe('a foto que não assina não derruba a leitura (spec 237 T3.4a)', () => {
  testWithPostgres(
    'a lista devolve a ocorrência e a marcação com os anexos vazios, e o log diz o que falhou',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const logged: { message: string; metadata?: Record<string, unknown> | undefined }[] = []
        const handle = createOccurrenceHandler({
          database,
          downloads: {
            createDownloadUrl: async () => {
              throw new Error('bucket indisponível com chave secreta')
            },
          },
          logger: {
            error: (message, metadata) => void logged.push({ message, metadata }),
            info() {},
            warn() {},
          },
        })

        const response = await handle(
          jsonRequest({ method: 'GET', path: `/cargo-arrivals/${damaged.arrivalId}/occurrences` }),
        )

        expect(response.status).toBe(200)
        const body = (await response.json()) as {
          data: {
            documents: { returnToContractor: string }[]
            occurrences: { attachments: unknown[]; id: string }[]
          }
        }
        expect(body.data.occurrences.map((item) => [item.id, item.attachments])).toEqual([
          [damaged.occurrenceId, []],
        ])
        expect(body.data.documents).toHaveLength(2)
        expect(logged).toEqual([
          {
            message: 'cargo_arrival_occurrence.attachments_unavailable',
            metadata: { errorName: 'Error', occurrenceId: damaged.occurrenceId },
          },
        ])
      })
    },
  )
})
