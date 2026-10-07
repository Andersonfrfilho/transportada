/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M4): a lista dos perfis contra Postgres — só a empresa do contexto,
 * perfil desligado fora do `enabled=true`, contratante sem perfil fora de tudo, e o cursor percorre a
 * lista inteira sem repetir nem pular.
 */
import { describe, expect, test } from 'bun:test'

import { createListContractorReceivingProfilesUseCase } from '../../src/cargo-receiving/application/contractor-receiving-profile.use-case.js'
import { DrizzleContractorReceivingProfileRepository } from '../../src/cargo-receiving/infrastructure/drizzle-contractor-receiving-profile.repository.js'
import { createContractorReceivingProfileListRoutes } from '../../src/cargo-receiving/presentation/contractor-receiving-profile-list.routes.js'
import { contractorReceivingProfiles, contractors } from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip

type Summary = { contractorId: string; isEnabled: boolean; previewEnabled: boolean }
type ListBody = { data: Summary[]; nextCursor: string | null }

function createHandler(database: TestDatabase): (query: string) => Promise<ListBody> {
  const routes = createContractorReceivingProfileListRoutes({
    listProfiles: createListContractorReceivingProfilesUseCase({
      repository: new DrizzleContractorReceivingProfileRepository(database.db),
    }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({ context: authenticatedContext(new Set(['fleet.read'])), routes }),
  })
  return async (query) => {
    const path = `/contractor-receiving-profiles${query}`
    const response = await handleRequest(jsonRequest({ method: 'GET', path }), { timeout() {} })
    expect(response.status).toBe(200)
    return (await response.json()) as ListBody
  }
}

async function readAll(list: (query: string) => Promise<ListBody>, filter: string) {
  const items: Summary[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page += 1) {
    const body = await list(`?limit=1${filter}${cursor === null ? '' : `&cursor=${cursor}`}`)
    items.push(...body.data)
    cursor = body.nextCursor
    if (cursor === null) return items
  }
  throw new Error('THE_CURSOR_NEVER_ENDED')
}

describe('a lista dos perfis de recebimento contra Postgres (spec 237, M4)', () => {
  testWithPostgres(
    'só a empresa do contexto, ligado separado de desligado e de ausente',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const disabledId = crypto.randomUUID()
        await database.db.insert(contractors).values({
          companyId: COMPANY_CONTEXT.companyId,
          id: disabledId,
          taxId: '11444777000161',
        })
        await database.db.insert(contractorReceivingProfiles).values([
          { companyId: COMPANY_CONTEXT.companyId, contractorId: disabledId, isEnabled: false },
          {
            companyId: tenants.foreignCompanyId,
            contractorId: tenants.foreignContractorId,
            isEnabled: true,
          },
        ])
        const list = createHandler(database)

        expect(await readAll(list, '&enabled=true')).toEqual([
          { contractorId: tenants.contractorId, isEnabled: true, previewEnabled: false },
        ])
        expect(await readAll(list, '&enabled=false')).toEqual([
          { contractorId: disabledId, isEnabled: false, previewEnabled: false },
        ])
        const everything = await readAll(list, '')
        expect(everything.map((item) => item.contractorId)).toEqual(
          [tenants.contractorId, disabledId].toSorted(),
        )
        expect(everything.map((item) => item.contractorId)).not.toContain(tenants.otherContractorId)
        expect(everything.map((item) => item.contractorId)).not.toContain(
          tenants.foreignContractorId,
        )
      })
    },
  )
})
