/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3 (ADR-0094 §6): rota, caso de uso e repositório de verdade contra Postgres — a
 * chegada nasce numa transação, repete sem duplicar, recusa toda nota inválida de uma vez, isola a
 * empresa, anda só para frente com trilha append-only e copia a janela do perfil para sempre.
 */
import { describe, expect, test } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  auditLogs,
  cargoArrivalDocuments,
  cargoArrivalEvents,
  cargoArrivals,
  contractorReceivingProfiles,
} from '../../src/database/database.schema.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  ARARAQUARA,
  hasTestDatabase,
  OTHER_ISSUER_TAX_ID,
  SAO_CARLOS,
  seedIssuedDocument,
  seedLiveTrip,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
  SEPARATOR_PERMISSIONS as SEPARATOR,
  type CargoArrivalHandle as Handle,
} from '../fixtures/cargo-arrival-http.fixture.js'
import { authenticatedContext, jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const HOUR_MS = 3_600_000
const ARRIVED_AT = new Date(Date.now() - 2 * HOUR_MS)

function createHandler(
  database: TestDatabase,
  context: AuthenticatedContext<CompanyContext> = authenticatedContext(SEPARATOR),
): Handle {
  return createCargoArrivalHandler({ context, database })
}

function post(path: string, body?: unknown, key?: string): Request {
  return buildPostRequest({ body, path, ...(key === undefined ? {} : { key }) })
}

function register(
  handle: Handle,
  input: { contractorId: string; documentIds: string[]; key: string },
) {
  const body = {
    arrivedAt: ARRIVED_AT.toISOString(),
    contractorId: input.contractorId,
    documentIds: input.documentIds,
    palletCount: 6,
  }
  return call(handle, post('/cargo-arrivals', body, input.key))
}

async function countRows(database: TestDatabase): Promise<Record<string, number>> {
  const [arrivals, documents, events, audits] = await Promise.all([
    database.db.select().from(cargoArrivals),
    database.db.select().from(cargoArrivalDocuments),
    database.db.select().from(cargoArrivalEvents),
    database.db.select().from(auditLogs).where(eq(auditLogs.entityType, 'cargo-arrival')),
  ])
  return {
    arrivals: arrivals.length,
    audits: audits.length,
    documents: documents.length,
    events: events.length,
  }
}

async function seedThree(database: TestDatabase): Promise<[string, string, string]> {
  return [
    await seedIssuedDocument(database, { number: '9' }),
    await seedIssuedDocument(database, { number: '10' }),
    await seedIssuedDocument(database, { cityCode: ARARAQUARA, number: '11' }),
  ]
}

describe('a chegada contra Postgres (spec 237 T2.3)', () => {
  testWithPostgres('registra numa transação, repete com 200 e recusa chave reusada', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const handle = createHandler(database)
      const documentIds = await seedThree(database)
      await seedIssuedDocument(database, { emitterTaxId: OTHER_ISSUER_TAX_ID, number: '12' })
      const availablePath = `/cargo-arrivals/available-documents?contractorId=${tenants.contractorId}`

      const available = await call(handle, jsonRequest({ method: 'GET', path: availablePath }))
      expect((available.body.data as unknown as unknown[]).length).toBe(3)

      const created = await register(handle, {
        ...tenants,
        documentIds,
        key: 'arrival-key-0000001',
      })
      expect(created.status).toBe(201)
      expect(created.body.data).toMatchObject({
        counts: { expected: 3, received: 0, separated: 0, total: 3 },
        deliveryDeadlineBusinessDays: 3,
        isSeparationOverdue: false,
        separationDueAt: new Date(ARRIVED_AT.getTime() + 24 * HOUR_MS).toISOString(),
        separationWindowHours: 24,
        status: 'open',
      })
      const groups = created.body.data?.groups as {
        cityIbgeCode: string
        documents: { number: string }[]
      }[]
      expect(groups.map((group) => group.cityIbgeCode)).toEqual([ARARAQUARA, SAO_CARLOS])
      expect(groups[1]?.documents.map((item) => item.number)).toEqual(['9', '10'])
      expect(await countRows(database)).toEqual({ arrivals: 1, audits: 1, documents: 3, events: 4 })

      const replay = await register(handle, {
        ...tenants,
        documentIds: [...documentIds].reverse(),
        key: 'arrival-key-0000001',
      })
      expect(replay.status).toBe(200)
      expect(replay.body.data?.id).toBe(created.body.data?.id)
      expect(await countRows(database)).toEqual({ arrivals: 1, audits: 1, documents: 3, events: 4 })

      const reused = await register(handle, {
        ...tenants,
        documentIds: [documentIds[0]],
        key: 'arrival-key-0000001',
      })
      expect(reused).toMatchObject({
        body: { error: { code: 'CARGO_ARRIVAL_KEY_REUSED' } },
        status: 409,
      })
      const after = await call(handle, jsonRequest({ method: 'GET', path: availablePath }))
      expect(after.body.data).toEqual([] as never)
    })
  })

  testWithPostgres(
    'recusa de uma vez a nota alheia, em viagem, em outra chegada e de outra empresa',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const handle = createHandler(database)
        const [free, taken, inTrip] = await seedThree(database)
        const otherIssuer = await seedIssuedDocument(database, {
          emitterTaxId: OTHER_ISSUER_TAX_ID,
          number: '20',
        })
        const foreign = await seedIssuedDocument(database, {
          companyId: tenants.foreignCompanyId,
          number: '21',
        })
        await seedLiveTrip(database, inTrip)
        expect(
          (await register(handle, { ...tenants, documentIds: [taken], key: 'arrival-key-first01' }))
            .status,
        ).toBe(201)

        const refused = await register(handle, {
          ...tenants,
          documentIds: [free, otherIssuer, inTrip, taken, foreign],
          key: 'arrival-key-second1',
        })
        expect(refused.status).toBe(422)
        expect(refused.body.error).toMatchObject({
          code: 'CARGO_ARRIVAL_DOCUMENTS_REFUSED',
          details: [
            { field: 'documentIds.1', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
            { field: 'documentIds.2', message: 'DOCUMENT_IN_LIVE_TRIP' },
            { field: 'documentIds.3', message: 'DOCUMENT_ALREADY_IN_ARRIVAL' },
            { field: 'documentIds.4', message: 'DOCUMENT_NOT_FOUND' },
          ],
        })
        expect(await countRows(database)).toEqual({
          arrivals: 1,
          audits: 1,
          documents: 1,
          events: 2,
        })
      })
    },
  )

  testWithPostgres('sem perfil ligado não abre chegada; outra empresa é 404', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const handle = createHandler(database)
      const [documentId] = await seedThree(database)
      const withoutProfile = await register(handle, {
        contractorId: tenants.otherContractorId,
        documentIds: [documentId],
        key: 'arrival-key-noprof1',
      })
      expect(withoutProfile).toMatchObject({
        body: { error: { code: 'CARGO_RECEIVING_NOT_ENABLED' } },
        status: 422,
      })
      await database.db.update(contractorReceivingProfiles).set({ isEnabled: false })
      const disabled = await register(handle, {
        ...tenants,
        documentIds: [documentId],
        key: 'arrival-key-noprof2',
      })
      expect(disabled).toMatchObject({
        body: { error: { code: 'CARGO_RECEIVING_NOT_ENABLED' } },
        status: 422,
      })
      const foreignContractor = await register(handle, {
        contractorId: tenants.foreignContractorId,
        documentIds: [documentId],
        key: 'arrival-key-noprof3',
      })
      expect(foreignContractor).toMatchObject({
        body: { error: { code: 'CONTRACTOR_NOT_FOUND' } },
        status: 404,
      })

      await database.db.update(contractorReceivingProfiles).set({ isEnabled: true })
      const created = await register(handle, {
        ...tenants,
        documentIds: [documentId],
        key: 'arrival-key-noprof4',
      })
      const arrivalId = String(created.body.data?.id)
      const foreignHandle = createHandler(database, foreignContext(tenants))
      const foreignRead = await call(
        foreignHandle,
        jsonRequest({ method: 'GET', path: `/cargo-arrivals/${arrivalId}` }),
      )
      expect(foreignRead).toMatchObject({
        body: { error: { code: 'CARGO_ARRIVAL_NOT_FOUND' } },
        status: 404,
      })
      const foreignWrite = await call(
        foreignHandle,
        post(`/cargo-arrivals/${arrivalId}/documents/${documentId}/receive`),
      )
      expect(foreignWrite.status).toBe(404)
      const foreignList = await call(
        foreignHandle,
        jsonRequest({ method: 'GET', path: '/cargo-arrivals' }),
      )
      expect(foreignList.body.data).toEqual([] as never)
      const [document] = await database.db.select().from(cargoArrivalDocuments)
      expect(document?.separationState).toBe('expected')
    })
  })

  testWithPostgres(
    'anda só para frente, repete sem evento, e a trilha não aceita UPDATE nem DELETE',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const handle = createHandler(database)
        const [first, second, third] = await seedThree(database)
        const created = await register(handle, {
          ...tenants,
          documentIds: [first, second, third],
          key: 'arrival-key-states1',
        })
        const base = `/cargo-arrivals/${String(created.body.data?.id)}/documents`

        expect((await call(handle, post(`${base}/${first}/receive`))).body.data).toMatchObject({
          outcome: 'changed',
          state: 'received',
        })
        expect((await call(handle, post(`${base}/${first}/receive`))).body.data).toMatchObject({
          outcome: 'unchanged',
        })
        expect(await call(handle, post(`${base}/${second}/separate`))).toMatchObject({
          body: { error: { code: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED' } },
          status: 409,
        })
        expect((await call(handle, post(`${base}/${first}/separate`))).status).toBe(200)
        expect(await call(handle, post(`${base}/${first}/receive`))).toMatchObject({
          body: { error: { code: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED' } },
          status: 409,
        })
        expect((await countRows(database)).events).toBe(4 + 2)

        const batch = await call(
          handle,
          post(`${base}/batch-status`, {
            documentIds: [second, crypto.randomUUID(), third],
            to: 'received',
          }),
        )
        expect(
          (batch.body.data?.results as { outcome: string }[]).map((item) => item.outcome),
        ).toEqual(['changed', 'refused', 'changed'])
        const mixed = await call(
          handle,
          post(`${base}/batch-status`, { documentIds: [first, second], to: 'separated' }),
        )
        expect(
          (mixed.body.data?.results as { outcome: string }[]).map((item) => item.outcome),
        ).toEqual(['unchanged', 'changed'])
        expect((await countRows(database)).events).toBe(6 + 3)

        expect(
          await captureFailure(() => database.db.update(cargoArrivalEvents).set({ details: {} })),
        ).toBe('55000')
        expect(await captureFailure(() => database.db.delete(cargoArrivalEvents))).toBe('55000')
      })
    },
  )

  testWithPostgres(
    'rota, fechamento com pendência, chegada fechada e janela congelada',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const handle = createHandler(database)
        const [first, second] = await seedThree(database)
        const created = await register(handle, {
          ...tenants,
          documentIds: [first, second],
          key: 'arrival-key-closing',
        })
        const arrivalPath = `/cargo-arrivals/${String(created.body.data?.id)}`
        const route = { documentIds: [first, second], routeName: 'FR.S.CAR' }

        expect((await call(handle, post(`${arrivalPath}/route-assignment`, route))).status).toBe(
          200,
        )
        const eventsAfterRoute = (await countRows(database)).events
        const again = await call(handle, post(`${arrivalPath}/route-assignment`, route))
        expect(
          (again.body.data?.results as { outcome: string }[]).every(
            (item) => item.outcome === 'unchanged',
          ),
        ).toBeTrue()
        expect((await countRows(database)).events).toBe(eventsAfterRoute)
        const outside = await call(
          handle,
          post(`${arrivalPath}/route-assignment`, {
            documentIds: [crypto.randomUUID()],
            routeName: 'X',
          }),
        )
        expect(outside.status).toBe(422)

        await call(
          handle,
          post(`${arrivalPath}/documents/batch-status`, {
            documentIds: [first, second],
            to: 'received',
          }),
        )
        await call(handle, post(`${arrivalPath}/documents/${first}/separate`))
        const pending = await call(handle, post(`${arrivalPath}/close`))
        expect(pending).toMatchObject({
          body: {
            error: {
              code: 'CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS',
              details: [{ documentId: second, field: 'pendingDocumentIds.0' }],
            },
          },
          status: 409,
        })

        await database.db.update(contractorReceivingProfiles).set({ separationWindowHours: 48 })
        await call(handle, post(`${arrivalPath}/documents/${second}/separate`))
        expect((await call(handle, post(`${arrivalPath}/close`))).body.data).toMatchObject({
          outcome: 'changed',
        })
        expect((await call(handle, post(`${arrivalPath}/close`))).body.data).toMatchObject({
          outcome: 'unchanged',
        })
        expect(await call(handle, post(`${arrivalPath}/route-assignment`, route))).toMatchObject({
          body: { error: { code: 'CARGO_ARRIVAL_CLOSED' } },
          status: 409,
        })

        const detail = await call(handle, jsonRequest({ method: 'GET', path: arrivalPath }))
        expect(detail.body.data).toMatchObject({
          separationDueAt: new Date(ARRIVED_AT.getTime() + 24 * HOUR_MS).toISOString(),
          separationWindowHours: 24,
          status: 'closed',
        })
        expect(await countRows(database)).toMatchObject({ audits: 2 })
        expect(
          await captureFailure(() =>
            database.db
              .update(cargoArrivals)
              .set({ separationDueAt: sql`${cargoArrivals.arrivedAt} + interval '1 hour'` }),
          ),
        ).toBe('23514')
      })
    },
  )

  testWithPostgres(
    'a leitura mostra a nota que já entrou em viagem; quem só lê não escreve',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const handle = createHandler(database)
        const [first, second] = await seedThree(database)
        const created = await register(handle, {
          ...tenants,
          documentIds: [first, second],
          key: 'arrival-key-trip001',
        })
        await seedLiveTrip(database, first)
        const detail = await call(
          handle,
          jsonRequest({ method: 'GET', path: `/cargo-arrivals/${String(created.body.data?.id)}` }),
        )
        const documents = (
          detail.body.data?.groups as {
            documents: { isInLiveTrip: boolean; nfeDocumentId: string }[]
          }[]
        ).flatMap((group) => group.documents)
        expect(
          Object.fromEntries(documents.map((item) => [item.nfeDocumentId, item.isInLiveTrip])),
        ).toEqual({ [first]: true, [second]: false })

        const reader = createHandler(database, authenticatedContext(new Set(['fleet.read'])))
        const third = await seedIssuedDocument(database, { number: '30' })
        const refused = await register(reader, {
          ...tenants,
          documentIds: [third],
          key: 'arrival-key-reader1',
        })
        expect(refused.status).toBe(403)
        expect((await countRows(database)).arrivals).toBe(1)
        const list = await call(
          reader,
          jsonRequest({
            method: 'GET',
            path: `/cargo-arrivals?contractorId=${tenants.contractorId}&status=open`,
          }),
        )
        expect(
          (list.body.data as unknown as { counts: { total: number } }[]).map(
            (item) => item.counts.total,
          ),
        ).toEqual([2])
        expect(
          await database.db
            .select()
            .from(cargoArrivals)
            .where(and(eq(cargoArrivals.status, 'open'))),
        ).toHaveLength(1)
      })
    },
  )
})

function foreignContext(tenants: CargoTenants): AuthenticatedContext<CompanyContext> {
  const context = authenticatedContext(SEPARATOR)
  return {
    identity: { ...context.identity, companyIdClaim: tenants.foreignCompanyId },
    scope: {
      ...context.scope,
      companyId: tenants.foreignCompanyId,
      membershipId: tenants.foreignMembershipId,
    },
  }
}

async function captureFailure(operation: () => PromiseLike<unknown>): Promise<string> {
  try {
    await operation()
    return 'no-failure'
  } catch (error) {
    return findPostgresError({ error })?.sqlState ?? 'not-a-postgres-error'
  }
}
