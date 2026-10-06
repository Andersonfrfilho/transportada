/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8a (ADR-0094 §9.3–9.5): a marcação "devolver ao contratante" contra Postgres — marcada,
 * a nota sai da recomendação de viagens e da proposta de chegada, não é separada e segura o
 * fechamento; desfazer é do escritório e devolve a nota ao fluxo; concluir espera a decisão e é
 * terminal; a chegada fecha com a devolvida; duas marcações simultâneas não duplicam nem travam.
 */
import { describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  cargoArrivalDocuments,
  cargoArrivalEvents,
  tripOccurrenceCases,
} from '../../src/database/database.schema.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import { proposeArrivalFromPreview } from '../../src/cargo-receiving/infrastructure/cargo-preview-proposal.query.js'
import { findExcludedTripDraftDocumentIds } from '../../src/cargo-receiving/infrastructure/cargo-preview-trip-draft.query.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
  SEPARATOR_PERMISSIONS,
} from '../fixtures/cargo-arrival-http.fixture.js'
import {
  createOccurrenceHandler,
  OFFICE_PERMISSIONS,
  occurrenceRequest,
  seedOccurrenceType,
  seedProduct,
} from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { seedPreviewItem, seedReadyPreview } from '../fixtures/cargo-preview-database.fixture.js'
import { withCargoRaceDatabase, raceUnderBlocker } from '../fixtures/cargo-arrival-race.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const ARRIVED_AT = new Date(Date.now() - 2 * 3_600_000)

type Damaged = {
  readonly arrivalId: string
  readonly documentIds: readonly [string, string]
  readonly occurrenceId: string
}

/** Chegada de duas notas conferidas; a primeira com avaria aberta. */
async function seedDamaged(database: TestDatabase, tenants: CargoTenants): Promise<Damaged> {
  const documentIds = [
    await seedIssuedDocument(database, { number: '31' }),
    await seedIssuedDocument(database, { number: '32' }),
  ] as const
  await seedProduct(database, { code: 'P1', documentId: documentIds[0], unit: 'CX' })
  const arrivals = createCargoArrivalHandler({ database })
  const registered = await call(
    arrivals,
    buildPostRequest({
      body: {
        arrivedAt: ARRIVED_AT.toISOString(),
        contractorId: tenants.contractorId,
        documentIds,
      },
      key: `arrival-${crypto.randomUUID()}`,
      path: '/cargo-arrivals',
    }),
  )
  const arrivalId = String(registered.body.data?.id)
  await call(
    arrivals,
    buildPostRequest({
      body: { documentIds, to: 'received' },
      path: `/cargo-arrivals/${arrivalId}/documents/batch-status`,
    }),
  )
  const typeId = await seedOccurrenceType(database, { stage: 'receiving' })
  const created = await createOccurrenceHandler({ database })(
    occurrenceRequest({
      arrivalId,
      documentId: documentIds[0],
      fields: { occurrenceTypeId: typeId, productCodes: ['P1'] },
      key: `damage-${crypto.randomUUID()}`,
    }),
  )
  const occurrenceId = ((await created.json()) as { data: { id: string } }).data.id
  return { arrivalId, documentIds, occurrenceId }
}

function returnAction(input: {
  readonly action: 'return-complete' | 'return-mark' | 'return-unmark'
  readonly arrivalId: string
  readonly body?: unknown
  readonly documentId: string
}): Request {
  return buildPostRequest({
    body: input.body ?? {},
    path: `/cargo-arrivals/${input.arrivalId}/documents/${input.documentId}/${input.action}`,
  })
}

async function statusAndCode(response: Response): Promise<readonly [number, unknown]> {
  const body = (await response.json()) as { data?: unknown; error?: { code?: string } }
  return [response.status, body.error?.code ?? (body.data as { outcome?: string }).outcome]
}

async function returnKinds(database: TestDatabase): Promise<readonly string[]> {
  const rows = await database.db
    .select({ kind: cargoArrivalEvents.kind })
    .from(cargoArrivalEvents)
    .where(sql`${cargoArrivalEvents.kind} like 'return_%'`)
    .orderBy(cargoArrivalEvents.recordedAt)
  return rows.map((row) => row.kind)
}

describe('a marcação "devolver ao contratante" (spec 237 RF8a)', () => {
  testWithPostgres(
    'marcada sai da recomendação e da proposta, não separa, segura o fechamento; desfeita, volta',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const [marked] = damaged.documentIds
        const previewId = await seedReadyPreview(database, {
          contractorId: tenants.contractorId,
          label: 'devolver',
        })
        await seedPreviewItem(database, {
          documentId: marked,
          previewId,
          rowNumber: 2,
          state: 'matched',
        })
        const office = createOccurrenceHandler({ database })
        const arrivals = createCargoArrivalHandler({ database })
        const scope = { companyId: COMPANY_CONTEXT.companyId, previewId }

        expect(await findExcludedTripDraftDocumentIds(database.db, scope)).toEqual(new Set())
        const mark = await office(
          returnAction({
            action: 'return-mark',
            arrivalId: damaged.arrivalId,
            body: { occurrenceId: damaged.occurrenceId },
            documentId: marked,
          }),
        )
        expect(await statusAndCode(mark)).toEqual([200, 'changed'])
        expect(await findExcludedTripDraftDocumentIds(database.db, scope)).toEqual(
          new Set([marked]),
        )

        const proposal = await database.db.transaction((transaction) =>
          proposeArrivalFromPreview(transaction, {
            ...scope,
            actorUserId: COMPANY_CONTEXT.userId,
            now: new Date(),
          }),
        )
        expect(proposal).toMatchObject({
          documentIds: [],
          refused: [{ documentId: marked, reason: 'DOCUMENT_RETURN_TO_CONTRACTOR' }],
        })

        const separate = await call(
          arrivals,
          buildPostRequest({
            path: `/cargo-arrivals/${damaged.arrivalId}/documents/${marked}/separate`,
          }),
        )
        expect([separate.status, separate.body.error?.code]).toEqual([
          409,
          'CARGO_ARRIVAL_DOCUMENT_MARKED_FOR_RETURN',
        ])
        await call(
          arrivals,
          buildPostRequest({
            path: `/cargo-arrivals/${damaged.arrivalId}/documents/${damaged.documentIds[1]}/separate`,
          }),
        )
        const close = await call(
          arrivals,
          buildPostRequest({ path: `/cargo-arrivals/${damaged.arrivalId}/close` }),
        )
        expect(close.status).toBe(409)
        expect(close.body.error?.details).toEqual([
          {
            documentId: marked,
            field: 'pendingDocumentIds.0',
            message: 'The document is marked to return to the contractor',
          },
        ])

        const separator = createOccurrenceHandler({
          context: authenticatedContext(SEPARATOR_PERMISSIONS),
          database,
        })
        const refused = await separator(
          returnAction({
            action: 'return-unmark',
            arrivalId: damaged.arrivalId,
            documentId: marked,
          }),
        )
        expect(refused.status).toBe(403)
        const unmark = await office(
          returnAction({
            action: 'return-unmark',
            arrivalId: damaged.arrivalId,
            body: { note: 'contratante aceitou' },
            documentId: marked,
          }),
        )
        expect(await statusAndCode(unmark)).toEqual([200, 'changed'])
        expect(await findExcludedTripDraftDocumentIds(database.db, scope)).toEqual(new Set())
        expect(await returnKinds(database)).toEqual(['return_marked', 'return_unmarked'])
      })
    },
  )

  testWithPostgres(
    'concluir espera a decisão, é terminal, e a chegada fecha com a devolvida',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const [marked, kept] = damaged.documentIds
        const office = createOccurrenceHandler({ database })
        const arrivals = createCargoArrivalHandler({ database })
        const act = (action: 'return-complete' | 'return-mark' | 'return-unmark', body?: unknown) =>
          office(returnAction({ action, arrivalId: damaged.arrivalId, body, documentId: marked }))

        await act('return-mark', { occurrenceId: damaged.occurrenceId })
        expect(await statusAndCode(await act('return-complete'))).toEqual([
          409,
          'CARGO_ARRIVAL_RETURN_DECISION_PENDING',
        ])
        await database.db
          .update(tripOccurrenceCases)
          .set({
            decidedAt: new Date(),
            decidedByUserId: COMPANY_CONTEXT.userId,
            decisionKind: 'other',
            decisionNote: 'devolver ao contratante',
            status: 'decided',
          })
          .where(eq(tripOccurrenceCases.occurrenceId, damaged.occurrenceId))
        expect(await statusAndCode(await act('return-complete'))).toEqual([200, 'changed'])
        expect(await statusAndCode(await act('return-complete'))).toEqual([200, 'unchanged'])
        expect(await statusAndCode(await act('return-unmark'))).toEqual([
          409,
          'CARGO_ARRIVAL_DOCUMENT_RETURNED',
        ])

        await call(
          arrivals,
          buildPostRequest({
            path: `/cargo-arrivals/${damaged.arrivalId}/documents/${kept}/separate`,
          }),
        )
        const close = await call(
          arrivals,
          buildPostRequest({ path: `/cargo-arrivals/${damaged.arrivalId}/close` }),
        )
        expect([close.status, close.body.data?.outcome]).toEqual([200, 'changed'])
        const [row] = await database.db
          .select({ state: cargoArrivalDocuments.returnToContractor })
          .from(cargoArrivalDocuments)
          .where(eq(cargoArrivalDocuments.nfeDocumentId, marked))
        expect(row?.state).toBe('returned')
        expect(await returnKinds(database)).toEqual(['return_marked', 'return_completed'])

        let violation: string | undefined
        try {
          await database.db.execute(
            sql`update cargo_arrival_events set kind = kind where kind = 'return_marked'`,
          )
        } catch (error) {
          violation = findPostgresError({ error })?.sqlState
        }
        expect(violation).toBe('55000')
      })
    },
  )

  testWithPostgres(
    'motivo de outra nota é 422, e o banco recusa o motivo alheio também',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const office = createOccurrenceHandler({ database })
        const response = await office(
          returnAction({
            action: 'return-mark',
            arrivalId: damaged.arrivalId,
            body: { occurrenceId: damaged.occurrenceId },
            documentId: damaged.documentIds[1],
          }),
        )
        expect(await statusAndCode(response)).toEqual([
          422,
          'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID',
        ])

        let constraint: string | undefined
        try {
          await database.db
            .update(cargoArrivalDocuments)
            .set({ returnOccurrenceId: damaged.occurrenceId, returnToContractor: 'marked' })
            .where(eq(cargoArrivalDocuments.nfeDocumentId, damaged.documentIds[1]))
        } catch (error) {
          constraint = findPostgresError({ error })?.constraint
        }
        expect(constraint).toBe('cargo_arrival_documents_return_occurrence_fk')
      })
    },
  )
})

describe('a outra empresa não alcança a nota nem a ocorrência (spec 237 T3.2, isolamento)', () => {
  testWithPostgres('ler, abrir, marcar e desfazer pela outra empresa é 404, sem gravar', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const damaged = await seedDamaged(database, tenants)
      const own = authenticatedContext(OFFICE_PERMISSIONS)
      const foreign = createOccurrenceHandler({
        context: {
          identity: { ...own.identity, companyIdClaim: tenants.foreignCompanyId },
          scope: {
            ...own.scope,
            companyId: tenants.foreignCompanyId,
            membershipId: tenants.foreignMembershipId,
          },
        },
        database,
      })
      const typeId = await seedOccurrenceType(database, {
        companyId: tenants.foreignCompanyId,
        stage: 'receiving',
      })
      const before = await returnKinds(database)

      const read = await foreign(
        jsonRequest({ method: 'GET', path: `/cargo-arrivals/${damaged.arrivalId}/occurrences` }),
      )
      const opened = await foreign(
        occurrenceRequest({
          arrivalId: damaged.arrivalId,
          documentId: damaged.documentIds[1],
          fields: { occurrenceTypeId: typeId, productCodes: ['P1'] },
          key: `foreign-${crypto.randomUUID()}`,
        }),
      )
      const marked = await foreign(
        returnAction({
          action: 'return-mark',
          arrivalId: damaged.arrivalId,
          body: { occurrenceId: damaged.occurrenceId },
          documentId: damaged.documentIds[0],
        }),
      )

      expect([read.status, opened.status, marked.status]).toEqual([404, 404, 404])
      expect(await returnKinds(database)).toEqual(before)
    })
  })
})

describe('duas marcações ao mesmo tempo (spec 237 T3.2, concorrência)', () => {
  testWithPostgres('uma marca, a outra é no-op; um evento só, sem deadlock', async () => {
    await withCargoRaceDatabase(async (race) => {
      const damaged = await seedDamaged(race.database, race.tenants)
      const office = createOccurrenceHandler({ database: race.database })
      const mark = () =>
        office(
          returnAction({
            action: 'return-mark',
            arrivalId: damaged.arrivalId,
            body: { occurrenceId: damaged.occurrenceId },
            documentId: damaged.documentIds[0],
          }),
        ).then(statusAndCode)

      const outcomes = await raceUnderBlocker({
        block: (transaction) => transaction.execute(sql`select 1 from cargo_arrivals for update`),
        race,
        waiters: 2,
        writes: [mark, mark],
      })

      expect(
        outcomes
          .map((outcome) => (outcome.status === 'fulfilled' ? outcome.value : outcome.reason))
          .sort(),
      ).toEqual([
        [200, 'changed'],
        [200, 'unchanged'],
      ])
      expect(await returnKinds(race.database)).toEqual(['return_marked'])
    })
  })
})
