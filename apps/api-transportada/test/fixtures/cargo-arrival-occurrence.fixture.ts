/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a avaria sem viagem e a marcação contra o banco descartável — as rotas da chegada e
 * as da ocorrência num handler só, com casos de uso e repositórios de verdade. O bucket e a URL
 * assinada são dublês em memória (a CI não sobe o MinIO). Dados inventados.
 */
import { createCargoArrivalOccurrenceRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival-occurrence.routes.js'
import { createChangeCargoArrivalReturnUseCase } from '../../src/cargo-receiving/application/cargo-arrival-return.use-case.js'
import {
  createListCargoArrivalOccurrencesUseCase,
  createListReceivingOccurrenceTypesUseCase,
} from '../../src/cargo-receiving/application/read-cargo-arrival-occurrences.use-case.js'
import { createRegisterCargoArrivalOccurrenceUseCase } from '../../src/cargo-receiving/application/register-cargo-arrival-occurrence.use-case.js'
import { DrizzleCargoArrivalOccurrenceReadRepository } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-occurrence-read.repository.js'
import { DrizzleCargoArrivalOccurrenceUnitOfWork } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-occurrence.repository.js'
import { DrizzleCargoArrivalReturnUnitOfWork } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-return.repository.js'
import { companyOccurrenceTypes, nfeProducts } from '../../src/database/database.schema.js'
import type { RedeliveryPolicy } from '../../src/database/trip.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { TripOccurrenceStage } from '../../src/shared/trip-occurrence.constant.js'
import { createOccurrenceCaseUseCase } from '../../src/trips/application/occurrence-case.use-case.js'
import { createOccurrenceCaseRoutes } from '../../src/trips/presentation/occurrence-case.routes.js'
import { DrizzleOccurrenceAttachmentRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import { createFindOccurrenceSettlementUseCase } from '../../src/trips/application/find-occurrence-settlement.use-case.js'
import { createRecordOccurrenceSettlementUseCase } from '../../src/trips/application/record-occurrence-settlement.use-case.js'
import { createReimburseOccurrenceSettlementUseCase } from '../../src/trips/application/reimburse-occurrence-settlement.use-case.js'
import { DrizzleOccurrenceSettlementChargeRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement-charge.repository.js'
import { DrizzleOccurrenceSettlementRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement.repository.js'
import { createOccurrenceSettlementRoutes } from '../../src/trips/presentation/occurrence-settlement.routes.js'
import type { TestDatabase } from './cargo-arrival-database.fixture.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
} from './freight-region-http.fixture.js'

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
export const OFFICE_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'occurrences.resolve',
  'trip.manage',
])

export type MemoryBucket = { readonly objects: Map<string, Uint8Array>; readonly removed: string[] }

export function createOccurrenceHandler(params: {
  readonly bucket?: MemoryBucket
  readonly context?: AuthenticatedContext<CompanyContext>
  readonly database: TestDatabase
  readonly now?: () => Date
}): (request: Request) => Promise<Response> {
  const db = params.database.db
  const now = params.now ?? (() => new Date())
  const bucket: MemoryBucket = params.bucket ?? { objects: new Map(), removed: [] }
  const reads = new DrizzleCargoArrivalOccurrenceReadRepository({
    attachments: new DrizzleOccurrenceAttachmentRepository(db),
    database: db,
    downloads: {
      createDownloadUrl: async ({ objectKey }) => ({
        expiresAt: '2099-01-01T00:00:00.000Z',
        url: `memory://${objectKey}`,
      }),
    },
  })
  const routes = createCargoArrivalOccurrenceRoutes({
    changeReturn: createChangeCargoArrivalReturnUseCase({
      channel: 'backoffice',
      now,
      unitOfWork: new DrizzleCargoArrivalReturnUnitOfWork(db),
    }),
    listOccurrences: createListCargoArrivalOccurrencesUseCase({ reads }),
    listTypes: createListReceivingOccurrenceTypesUseCase({ reads }),
    registerOccurrence: createRegisterCargoArrivalOccurrenceUseCase({
      channel: 'backoffice',
      newObjectId: () => crypto.randomUUID(),
      now,
      reads,
      storage: {
        remove: async ({ objectKey }) => {
          bucket.removed.push(objectKey)
          bucket.objects.delete(objectKey)
        },
        store: async ({ bytes, objectKey }) => {
          bucket.objects.set(objectKey, bytes)
          return { sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') }
        },
      },
      unitOfWork: new DrizzleCargoArrivalOccurrenceUnitOfWork(db, 'integration'),
    }),
  })
  const caseRepository = new DrizzleOccurrenceCaseRepository(db)
  const caseRoutes = createOccurrenceCaseRoutes({
    findCaseIdByOccurrenceId: (input) => caseRepository.findIdByOccurrenceId(input),
    occurrenceCase: createOccurrenceCaseUseCase({ repository: caseRepository }),
  })
  const settlementRepository = new DrizzleOccurrenceSettlementRepository(
    db,
    new DrizzleOccurrenceSettlementChargeRepository(async () => null),
  )
  const settlementRoutes = createOccurrenceSettlementRoutes({
    findCaseIdByOccurrenceId: (input) => caseRepository.findIdByOccurrenceId(input),
    settlement: createRecordOccurrenceSettlementUseCase({ repository: settlementRepository }),
    settlementFind: createFindOccurrenceSettlementUseCase({ repository: settlementRepository }),
    settlementReimbursement: createReimburseOccurrenceSettlementUseCase({
      repository: settlementRepository,
    }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: params.context ?? authenticatedContext(OFFICE_PERMISSIONS),
      routes: [...routes, ...caseRoutes, ...settlementRoutes],
    }),
  })
  return (request) => handleRequest(request, { timeout() {} })
}

export function occurrenceRequest(input: {
  readonly arrivalId: string
  readonly documentId: string
  readonly fields: Record<string, string | readonly string[]>
  readonly key: string
}): Request {
  const form = new FormData()
  for (const [name, value] of Object.entries(input.fields)) {
    for (const item of typeof value === 'string' ? [value] : value) form.append(name, item)
  }
  form.append('file', new File([JPEG], 'avaria.jpg', { type: 'image/jpeg' }))
  return new Request(
    `${FRONTEND_ORIGIN}/cargo-arrivals/${input.arrivalId}/documents/${input.documentId}/occurrences`,
    {
      body: form,
      headers: {
        'idempotency-key': input.key,
        origin: FRONTEND_ORIGIN,
        'x-correlation-id': CORRELATION_ID,
      },
      method: 'POST',
    },
  )
}

export async function seedOccurrenceType(
  database: TestDatabase,
  input: {
    readonly active?: boolean
    readonly companyId?: string
    readonly name?: string
    readonly redeliveryPolicy?: RedeliveryPolicy
    readonly stage: TripOccurrenceStage
  },
): Promise<string> {
  const [row] = await database.db
    .insert(companyOccurrenceTypes)
    .values({
      active: input.active ?? true,
      companyId: input.companyId ?? COMPANY_CONTEXT.companyId,
      name: input.name ?? `Tipo ${input.stage}`,
      redeliveryPolicy: input.redeliveryPolicy ?? 'blocked',
      stage: input.stage,
    })
    .returning({ id: companyOccurrenceTypes.id })
  if (row === undefined) throw new Error('occurrence type not seeded')
  return row.id
}

export async function seedProduct(
  database: TestDatabase,
  input: { readonly code: string; readonly documentId: string; readonly unit: string },
): Promise<void> {
  await database.db.insert(nfeProducts).values({
    cfop: '5102',
    code: input.code,
    commercialUnit: input.unit,
    companyId: COMPANY_CONTEXT.companyId,
    description: `Produto ${input.code}`,
    documentId: input.documentId,
    ncm: '00000000',
    ordinal: 1n,
    quantity: '10.0000',
    totalValue: '100.0000',
    unitValue: '10.0000',
  })
}
