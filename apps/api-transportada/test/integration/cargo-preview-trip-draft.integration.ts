/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1 contra Postgres: `GET /cargo-previews/:id/trip-drafts` agrupa por roteiro as notas
 * VINCULADAS, deixa a nota em viagem viva fora dos ids roteáveis, soma sem repetir a nota de várias
 * linhas, ordena de forma estável e nunca mostra a prévia de outra empresa (404).
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createCargoPreviewHttpRoutes } from '../../src/cargo-receiving/cargo-preview.composition.js'
import {
  selectTripDraftDocuments,
  selectTripDraftItems,
  selectTripDraftRouteLoads,
} from '../../src/cargo-receiving/infrastructure/cargo-preview-trip-draft.query.js'
import {
  cargoPreviewDocumentLinks,
  cargoPreviewItems,
  cargoPreviewRouteLoads,
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  ARARAQUARA,
  hasTestDatabase,
  SAO_CARLOS,
  seedIssuedDocument,
  seedLiveTrip,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  createPreviewStorage,
  seedReadyPreview,
} from '../fixtures/cargo-preview-database.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])

type TripDraftsBody = {
  readonly data: {
    readonly routableDocumentIds: readonly string[]
    readonly routes: readonly {
      readonly canPropose: boolean
      readonly cannotProposeReason: string | null
      readonly cities: readonly Readonly<Record<string, unknown>>[]
      readonly counts: Record<string, number>
      readonly documents: readonly {
        readonly documentId: string
        readonly isInLiveTrip: boolean
        readonly lineCount: number
        readonly number: string
        readonly weightKg: string | null
      }[]
      readonly linkedTotals: { readonly value: string; readonly weightKg: string }
      readonly loadReference: string | null
      readonly missingCount: number
      readonly routableDocumentIds: readonly string[]
      readonly routeName: string | null
      readonly totals: {
        readonly value: string
        readonly volumeM3: string | null
        readonly weightKg: string
      }
    }[]
    readonly summary: Record<string, unknown>
  }
}

function createGet(database: TestDatabase) {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: authenticatedContext(READER),
      routes: createCargoPreviewHttpRoutes({
        bucket: 'private',
        database: database.db,
        storage: createPreviewStorage(),
      }),
    }),
  })
  return async (previewId: string) => {
    const response = await handleRequest(
      jsonRequest({ method: 'GET', path: `/cargo-previews/${previewId}/trip-drafts` }),
      { timeout() {} },
    )
    return {
      body: response.status === 200 ? ((await response.json()) as TripDraftsBody) : null,
      status: response.status,
    }
  }
}

type ItemSeed = {
  readonly city?: string
  readonly documentId?: string
  readonly rowNumber: number
  readonly routeName: string | null
  readonly state: 'ambiguous' | 'awaiting_xml' | 'invalid' | 'matched' | 'suggested'
  readonly value?: string
  readonly volumeM3?: string
  readonly weightKg?: string
}

async function seedItems(
  database: TestDatabase,
  input: {
    readonly companyId?: string
    readonly items: readonly ItemSeed[]
    readonly previewId: string
  },
): Promise<void> {
  const companyId = input.companyId ?? COMPANY_CONTEXT.companyId
  const links = new Set(
    input.items.flatMap((item) =>
      item.state === 'matched' && item.documentId ? [item.documentId] : [],
    ),
  )
  for (const documentId of links) {
    await database.db
      .insert(cargoPreviewDocumentLinks)
      .values({ companyId, documentId, linkedBy: 'system', previewId: input.previewId })
  }
  await database.db.insert(cargoPreviewItems).values(
    input.items.map((item) => ({
      city: item.city ?? 'SAO CARLOS',
      companyId,
      matchState: item.state,
      matchedAt: item.state === 'awaiting_xml' || item.state === 'invalid' ? null : new Date(),
      matchedBy:
        item.state === 'awaiting_xml' || item.state === 'invalid' ? null : ('system' as const),
      matchedDocumentId: item.state === 'matched' ? (item.documentId ?? null) : null,
      previewId: input.previewId,
      rowError:
        item.state === 'invalid' ? [{ column: 'VALOR', field: 'value', message: 'x' }] : null,
      routeName: item.routeName,
      rowNumber: item.rowNumber,
      state: 'SP',
      value: item.state === 'invalid' ? null : (item.value ?? '100.00'),
      volumeM3: item.volumeM3 ?? null,
      weightKg: item.state === 'invalid' ? null : (item.weightKg ?? '10.000'),
    })),
  )
}

async function describeDocument(
  database: TestDatabase,
  input: {
    readonly cityName: string
    readonly documentId: string
    readonly grossWeights: readonly string[]
    readonly totalValue: string
  },
): Promise<void> {
  const companyId = COMPANY_CONTEXT.companyId
  await database.db
    .update(nfeDocuments)
    .set({ totalValue: input.totalValue })
    .where(eq(nfeDocuments.id, input.documentId))
  const participants = await database.db
    .select({ id: nfeParticipants.id, role: nfeParticipants.role })
    .from(nfeParticipants)
    .where(eq(nfeParticipants.documentId, input.documentId))
  const recipient = participants.find((participant) => participant.role === 'recipient')
  if (recipient === undefined) throw new Error('A nota semeada precisa de destinatário')
  await database.db
    .update(nfeAddresses)
    .set({ city: input.cityName })
    .where(eq(nfeAddresses.participantId, recipient.id))
  let ordinal = 1n
  for (const grossWeight of input.grossWeights) {
    await database.db
      .insert(nfeVolumes)
      .values({ companyId, documentId: input.documentId, grossWeight, ordinal })
    ordinal += 1n
  }
}

describe('os rascunhos de viagem da prévia contra o banco (spec 237 T5.1)', () => {
  testWithPostgres(
    'dois roteiros: vinculada, esperando o XML, sugerida, ambígua, inválida e nota em viagem viva',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const get = createGet(database)
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'rascunhos' })
        const [free, live, araraquara, twin] = [
          await seedIssuedDocument(database, { number: '300' }),
          await seedIssuedDocument(database, { number: '110' }),
          await seedIssuedDocument(database, { cityCode: ARARAQUARA, number: '120' }),
          await seedIssuedDocument(database, { number: '95' }),
        ]
        await describeDocument(database, {
          cityName: 'São Carlos',
          documentId: free,
          grossWeights: ['4.000', '6.500'],
          totalValue: '300.0000',
        })
        await describeDocument(database, {
          cityName: 'São Carlos',
          documentId: twin,
          grossWeights: ['2.000'],
          totalValue: '50.0000',
        })
        await describeDocument(database, {
          cityName: 'Araraquara',
          documentId: live,
          grossWeights: ['1.000'],
          totalValue: '80.0000',
        })
        await describeDocument(database, {
          cityName: 'Araraquara',
          documentId: araraquara,
          grossWeights: ['7.000'],
          totalValue: '70.0000',
        })
        await seedLiveTrip(database, live)
        await seedItems(database, {
          items: [
            {
              documentId: free,
              rowNumber: 1,
              routeName: 'FR.B',
              state: 'matched',
              value: '100.00',
              volumeM3: '0.2000',
            },
            {
              documentId: free,
              rowNumber: 2,
              routeName: 'FR.B',
              state: 'matched',
              value: '200.00',
              volumeM3: '0.1000',
              weightKg: '6.500',
            },
            { documentId: twin, rowNumber: 3, routeName: 'FR.B', state: 'matched', value: '50.00' },
            { rowNumber: 4, routeName: 'FR.B', state: 'awaiting_xml' },
            { rowNumber: 5, routeName: 'FR.B', state: 'suggested' },
            {
              city: 'ARARAQUARA',
              documentId: live,
              rowNumber: 6,
              routeName: 'FR.A',
              state: 'matched',
              value: '80.00',
            },
            {
              city: 'ARARAQUARA',
              documentId: araraquara,
              rowNumber: 7,
              routeName: 'FR.A',
              state: 'matched',
              value: '70.00',
              weightKg: '7.000',
            },
            { rowNumber: 8, routeName: 'FR.A', state: 'ambiguous' },
            { rowNumber: 9, routeName: null, state: 'invalid' },
          ],
          previewId,
        })
        await database.db.insert(cargoPreviewRouteLoads).values({
          companyId: COMPANY_CONTEXT.companyId,
          loadReference: '778899',
          origin: 'totals',
          previewId,
          routeName: 'FR.B',
        })

        const { body, status } = await get(previewId)

        expect(status).toBe(200)
        const drafts = body?.data
        expect(drafts?.routes.map((route) => route.routeName)).toEqual(['FR.A', 'FR.B', null])
        const [routeA, routeB, withoutRoute] = drafts?.routes ?? []

        expect(routeB?.loadReference).toBe('778899')
        expect(routeB?.counts).toEqual({
          ambiguous: 0,
          awaiting_xml: 1,
          invalid: 0,
          matched: 3,
          suggested: 1,
          total: 5,
        })
        expect(routeB?.missingCount).toBe(1)
        expect(routeB?.documents.map((entry) => [entry.number, entry.lineCount])).toEqual([
          ['95', 1],
          ['300', 2],
        ])
        expect(routeB?.documents.find((entry) => entry.number === '300')?.weightKg).toBe('10.500')
        expect(routeB?.linkedTotals).toEqual({ value: '350.0000', weightKg: '12.500' })
        expect(routeB?.totals.value).toBe('550.00')
        expect(routeB?.totals.volumeM3).toBe('0.3000')
        expect(routeB?.routableDocumentIds).toEqual([twin, free])
        expect(routeB?.canPropose).toBe(true)
        expect(routeB?.cities).toEqual([
          {
            cityIbgeCode: SAO_CARLOS,
            cityName: 'São Carlos',
            documentCount: 2,
            pendingLineCount: 2,
          },
        ])

        expect(routeA?.documents.map((entry) => [entry.number, entry.isInLiveTrip])).toEqual([
          ['110', true],
          ['120', false],
        ])
        expect(routeA?.routableDocumentIds).toEqual([araraquara])
        expect(routeA?.counts.ambiguous).toBe(1)

        expect(withoutRoute?.counts.invalid).toBe(1)
        expect(withoutRoute?.canPropose).toBe(false)
        expect(withoutRoute?.cannotProposeReason).toBe('no_linked_documents')

        expect(drafts?.routableDocumentIds).toEqual([araraquara, twin, free])
        expect(drafts?.summary).toMatchObject({
          canPropose: true,
          inLiveTripDocumentCount: 1,
          linkedDocumentCount: 4,
          missingCount: 1,
          routableDocumentCount: 3,
          routeCount: 2,
        })
      })
    },
  )

  testWithPostgres(
    'prévia sem nenhum vínculo: todos os roteiros com `canPropose=false`',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const get = createGet(database)
        const previewId = await seedReadyPreview(database, { ...tenants, label: 'sem-vinculo' })
        await seedItems(database, {
          items: [
            { rowNumber: 1, routeName: 'FR.A', state: 'awaiting_xml' },
            { rowNumber: 2, routeName: 'FR.B', state: 'awaiting_xml' },
            { rowNumber: 3, routeName: 'FR.B', state: 'suggested' },
          ],
          previewId,
        })

        const { body } = await get(previewId)

        expect(body?.data.routes.map((route) => route.canPropose)).toEqual([false, false])
        expect(body?.data.routableDocumentIds).toEqual([])
        expect(body?.data.summary).toMatchObject({ canPropose: false, missingCount: 2 })
      })
    },
  )

  testWithPostgres('a prévia de outra empresa, ou que não existe, é 404', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const get = createGet(database)
      const foreign = await seedReadyPreview(database, {
        companyId: tenants.foreignCompanyId,
        contractorId: tenants.foreignContractorId,
        label: 'alheia',
      })

      expect((await get(foreign)).status).toBe(404)
      expect((await get(crypto.randomUUID())).status).toBe(404)
    })
  })

  testWithPostgres('a nota vinculada em outra prévia não aparece nesta', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const get = createGet(database)
      const mine = await seedReadyPreview(database, { ...tenants, label: 'minha' })
      const other = await seedReadyPreview(database, { ...tenants, label: 'outra' })
      const documentId = await seedIssuedDocument(database, { number: '777' })
      await seedItems(database, {
        items: [{ documentId, rowNumber: 1, routeName: 'FR.X', state: 'matched' }],
        previewId: other,
      })
      await seedItems(database, {
        items: [{ rowNumber: 1, routeName: 'FR.X', state: 'awaiting_xml' }],
        previewId: mine,
      })

      const { body } = await get(mine)

      expect(body?.data.routes[0]?.documents).toEqual([])
      expect(body?.data.routableDocumentIds).toEqual([])
    })
  })

  testWithPostgres(
    'as consultas nunca cruzam a empresa nem a prévia: a chave do outro lado volta vazia',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const mine = await seedReadyPreview(database, { ...tenants, label: 'cruzamento-minha' })
        const foreign = await seedReadyPreview(database, {
          companyId: tenants.foreignCompanyId,
          contractorId: tenants.foreignContractorId,
          label: 'cruzamento-alheia',
        })
        const foreignDocument = await seedIssuedDocument(database, {
          companyId: tenants.foreignCompanyId,
          number: '888',
        })
        const mineDocument = await seedIssuedDocument(database, { number: '889' })
        await seedItems(database, {
          companyId: tenants.foreignCompanyId,
          items: [
            { documentId: foreignDocument, rowNumber: 1, routeName: 'FR.Z', state: 'matched' },
          ],
          previewId: foreign,
        })
        await seedItems(database, {
          items: [{ documentId: mineDocument, rowNumber: 1, routeName: 'FR.Y', state: 'matched' }],
          previewId: mine,
        })
        for (const companyId of [COMPANY_CONTEXT.companyId, tenants.foreignCompanyId]) {
          await database.db.insert(cargoPreviewRouteLoads).values({
            companyId,
            loadReference: companyId === COMPANY_CONTEXT.companyId ? '111' : '222',
            origin: 'totals',
            previewId: companyId === COMPANY_CONTEXT.companyId ? mine : foreign,
            routeName: 'FR.Q',
          })
        }
        const here = COMPANY_CONTEXT.companyId

        expect(
          await selectTripDraftItems(database.db, { companyId: here, previewId: foreign }),
        ).toEqual([])
        expect(
          await selectTripDraftDocuments(database.db, { companyId: here, previewId: foreign }),
        ).toEqual([])
        expect(
          await selectTripDraftRouteLoads(database.db, { companyId: here, previewId: foreign }),
        ).toEqual([])
        const own = await selectTripDraftDocuments(database.db, {
          companyId: here,
          previewId: mine,
        })
        expect(own.map((row) => row.id)).toEqual([mineDocument])
      })
    },
  )
})
