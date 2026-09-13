/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — a liquidação contra Postgres, pelos casos de uso reais de prévia, confirmação,
 * emissão e faturamento. A resposta da SEFAZ é simulada escrevendo o que o worker escreveria
 * (tentativa autorizada ou rejeitada, documento fiscal); nenhuma chamada fiscal sai daqui.
 *
 * - AC6: 38 CT-e autorizados e 1 rejeitado → uma fatura por tomador, em nome de quem confirmou, com
 *   o vencimento da prévia; o resumo nomeia o rejeitado e a NFS-e "autorizada, sem fatura";
 * - revalidação: membership suspensa antes da liquidação → nenhuma fatura, e o resumo diz por quê.
 *
 * A NFS-e entra semeada já `authorized`: o `create` dela travou em 3 de 5 rodadas na T013
 * (`nfse-invoice-selection.query.ts:92`), e o que se prova aqui é a liquidação, não a emissão.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { createBillingUseCase } from '../../src/billing/application/billing.use-case.js'
import { DrizzleBillingRepository } from '../../src/billing/infrastructure/drizzle-billing.repository.js'
import { createIdempotencyFingerprintService } from '../../src/companies/application/idempotency-fingerprint.service.js'
import { createCteBatchUseCase } from '../../src/cte-batches/application/cte-batch.use-case.js'
import { DrizzleCteBatchRepository } from '../../src/cte-batches/infrastructure/drizzle-cte-batch.repository.js'
import { DrizzleCteEmissionProfileCatalogRepository } from '../../src/cte-batches/infrastructure/drizzle-cte-emission-profile-catalog.repository.js'
import { createCteIssuanceUseCase } from '../../src/cte-issuance/application/cte-issuance.use-case.js'
import { createCteDocumentDownloadGateway } from '../../src/cte-issuance/infrastructure/cte-document-download.gateway.js'
import { DrizzleCteIssuanceRepository } from '../../src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.js'
import { DrizzleCteEmissionProfileRepository } from '../../src/cte-profiles/infrastructure/drizzle-cte-emission-profile.repository.js'
import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  billingInvoiceItems,
  billingInvoices,
  companies,
  companyFiscalProfiles,
  cteBatchItems,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuancePayloads,
  fiscalSequences,
  freightRules,
  freightRuleVersions,
  identityUsers,
  membershipRoles,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
  nfseEmissionProfiles,
  nfseServiceInvoices,
  storedObjects,
  userCompanyMemberships,
  whatsAppCommandRequests,
} from '../../src/database/database.schema.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case.js'
import { DrizzleNfseInvoiceRepository } from '../../src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createConfirmDocumentSelectionUseCase } from '../../src/whatsapp-commands/application/confirm-document-selection.use-case.js'
import { createPreviewDocumentSelectionUseCase } from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import { createNfseCredentialGapFinder } from '../../src/whatsapp-commands/application/preview-nfse-blocks.service.js'
import {
  createSettleWhatsAppCommandUseCase,
  type SettleWhatsAppCommandDependencies,
} from '../../src/whatsapp-commands/application/settle-whatsapp-command.use-case.js'
import {
  WHATSAPP_COMMAND_SETTLEMENT_AUDIT,
  WHATSAPP_COMMAND_SETTLEMENT_MAX_ATTEMPTS,
} from '../../src/whatsapp-commands/domain/whatsapp-command-settlement-retry.policy.js'
import { DrizzleDocumentSelectionRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-document-selection.repository.js'
import { DrizzleWhatsAppCommandSettlementRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command-settlement.repository.js'
import { DrizzleWhatsAppCommandRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const NOT_STORAGE = {} as NfeStorageGateway
const SHA = 'e'.repeat(64)
const EMITTER_TAX_ID = '11222333000181'
const TAKER_A = '44555666000109'
const TAKER_B = '77888999000105'
const CARRIER_TAX_ID_ROOT = '12345678'
const REJECTED_NUMBER = 1238
/** 39 notas: as pares vão ao tomador A, as ímpares ao B — 19 autorizadas de cada lado. */
const AC6_NUMBERS = Array.from({ length: 39 }, (_, index) => 1200 + index)
const PERMISSIONS: readonly CompanyPermission[] = ['cte.manage', 'cte.submit', 'billing.create']
const SILENT_LOGGER = { error() {}, info() {}, warn() {} }

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_t014_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runAllDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

describe('a liquidação fatura em nome de quem confirmou (spec 144 T014, AC6)', () => {
  testWithPostgres(
    'AC6 — 38 autorizados e 1 rejeitado: uma fatura por tomador, e o resumo nomeia o rejeitado',
    async () => {
      const db = requireDatabase()
      const world = await seedCompany(db, AC6_NUMBERS)
      const scenario = buildScenario(db)
      const requestId = await freezeAndConfirm(scenario, world, AC6_NUMBERS)
      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))

      await answerFromSefaz(db, world)
      const payloadTakers = await db
        .selectDistinct({ taker: cteIssuancePayloads.takerTaxId })
        .from(cteIssuancePayloads)
        .where(eq(cteIssuancePayloads.companyId, world.companyId))
      // O tomador da fatura sai do payload (`buildBillingTakerJoin`); o da liquidação, do pedido.
      expect(payloadTakers.map((row) => row.taker).toSorted()).toEqual([TAKER_A, TAKER_B])
      await seedAuthorizedNfse(db, world, requestId)

      const outcome = await scenario.settle({
        companyId: world.companyId,
        correlationId: 'corr-t014-ac6',
        requestId,
      })

      if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
      expect([outcome.status, outcome.settlementOutcome]).toEqual(['settled', 'completed'])
      const invoices = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.companyId, world.companyId))
      expect(invoices.map((invoice) => invoice.idempotencyKey).toSorted()).toEqual([
        `whatsapp:${requestId}:billing:${TAKER_A}`,
        `whatsapp:${requestId}:billing:${TAKER_B}`,
      ])
      for (const invoice of invoices) {
        expect(invoice.actorUserId).toBe(world.userId)
        expect(toDay(invoice.dueDate)).toBe(request?.dueDate ?? 'missing')
      }
      expect(invoices.map((invoice) => invoice.customerDocument).toSorted()).toEqual([
        TAKER_A,
        TAKER_B,
      ])
      expect(await countActiveItems(db, world.companyId)).toBe(38)

      const journal = await new DrizzleWhatsAppCommandRepository(db).listJournal({
        companyId: world.companyId,
        requestId,
      })
      const billingSteps = journal.filter((step) => step.documentKind === 'billing_invoice')
      expect(billingSteps.map((step) => [step.groupKey, step.status]).toSorted()).toEqual([
        [TAKER_A, 'created'],
        [TAKER_B, 'created'],
      ])
      expect(billingSteps.map((step) => step.documentId).toSorted()).toEqual(
        invoices.map((invoice) => invoice.id).toSorted(),
      )

      expect(outcome.message).toContain('38 CT-e autorizados')
      expect(outcome.message).toContain(
        `NF-e ${REJECTED_NUMBER}: 539 — Rejeicao: Duplicidade de CT-e`,
      )
      expect(outcome.message).toContain('1 NFS-e autorizada, sem fatura')
      expect(outcome.message).toContain('tomador final 0109: 19 CT-e')
      expect(outcome.message).toContain('tomador final 0105: 19 CT-e')

      // Repetir — a rede do worker cai depois de a API responder — não fatura de novo.
      expect(
        await scenario.settle({ companyId: world.companyId, correlationId: 'retry', requestId }),
      ).toEqual({ kind: 'already_settled' })
      expect(await countRows(db, world.companyId)).toBe(2)
      expect(await countActiveItems(db, world.companyId)).toBe(38)
    },
    240_000,
  )

  testWithPostgres(
    'revalidação — quem confirmou foi suspenso antes da liquidação: nenhuma fatura sai',
    async () => {
      const db = requireDatabase()
      const numbers = [1300, 1301, 1302]
      const world = await seedCompany(db, numbers)
      const scenario = buildScenario(db)
      const requestId = await freezeAndConfirm(scenario, world, numbers)
      await answerFromSefaz(db, world)

      await db
        .update(userCompanyMemberships)
        .set({ status: 'disabled' })
        .where(eq(userCompanyMemberships.id, world.membershipId))

      const outcome = await scenario.settle({
        companyId: world.companyId,
        correlationId: 'corr-t014-revalidation',
        requestId,
      })

      if (outcome.kind !== 'settled') throw new Error(`esperava settled, veio ${outcome.kind}`)
      expect([outcome.status, outcome.settlementOutcome]).toEqual([
        'settled_partial',
        'actor_not_authorized',
      ])
      expect(await countRows(db, world.companyId)).toBe(0)
      // T014b (M2): quem perdeu o acesso não recebe resumo; o desfecho fica gravado.
      expect(outcome.message).toBeUndefined()
      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect([request?.status, request?.settlementOutcome]).toEqual([
        'settled_partial',
        'actor_not_authorized',
      ])
    },
    240_000,
  )
})

/**
 * Spec 144 T020 (B2): o pedido que nunca chegava a estado final. O `resume_denied` deixava o
 * `confirming` para sempre, e o erro fora do domínio subia a cada batida — os dois voltavam no topo
 * da varredura e, somando o teto, calavam a liquidação de todo o resto.
 */
describe('a liquidação não trava (spec 144 T020, B2)', () => {
  testWithPostgres(
    'retomada com o ator suspenso leva o confirming parado a settled_partial',
    async () => {
      const db = requireDatabase()
      const numbers = [1400, 1401]
      const world = await seedCompany(db, numbers)
      const scenario = buildScenario(db)
      const requestId = await freezeAndConfirm(scenario, world, numbers)
      await db
        .update(whatsAppCommandRequests)
        .set({ confirmedAt: new Date(Date.now() - 20 * 60_000), status: 'confirming' })
        .where(eq(whatsAppCommandRequests.id, requestId))
      await db
        .update(userCompanyMemberships)
        .set({ status: 'disabled' })
        .where(eq(userCompanyMemberships.id, world.membershipId))

      const outcome = await scenario.settle({
        companyId: world.companyId,
        correlationId: 'corr-t020-resume-denied',
        requestId,
      })

      expect(outcome).toMatchObject({
        kind: 'settled',
        settlementOutcome: 'actor_not_authorized',
        status: 'settled_partial',
      })
      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect([request?.status, request?.settlementOutcome]).toEqual([
        'settled_partial',
        'actor_not_authorized',
      ])
      expect(request?.settledAt).toBeInstanceOf(Date)
    },
    240_000,
  )

  testWithPostgres(
    'erro fora do domínio recua a cada tentativa e, esgotado, encerra com trilha',
    async () => {
      const db = requireDatabase()
      const numbers = [1410, 1411]
      const world = await seedCompany(db, numbers)
      const brokenBilling = buildScenario(db, {
        billing: {
          async create() {
            throw new Error('connection reset by peer')
          },
        },
      })
      const requestId = await freezeAndConfirm(brokenBilling, world, numbers)
      await answerFromSefaz(db, world)
      const settleInput = { companyId: world.companyId, correlationId: 'corr-t020', requestId }

      for (let attempt = 1; attempt < WHATSAPP_COMMAND_SETTLEMENT_MAX_ATTEMPTS; attempt += 1) {
        expect(await brokenBilling.settle(settleInput)).toEqual({ kind: 'deferred' })
      }
      const [deferred] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect(deferred?.status).toBe('dispatched')
      expect(deferred?.settlementAttempts).toBe(WHATSAPP_COMMAND_SETTLEMENT_MAX_ATTEMPTS - 1)
      expect(deferred?.lastErrorCode).toBe('Error')
      expect(deferred?.nextSettlementAt?.getTime() ?? 0).toBeGreaterThan(Date.now())

      const outcome = await brokenBilling.settle(settleInput)

      expect(outcome).toMatchObject({ kind: 'settled', settlementOutcome: 'settlement_failed' })
      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect([request?.status, request?.settlementOutcome, request?.nextSettlementAt]).toEqual([
        'settled_partial',
        'settlement_failed',
        null,
      ])
      const trail = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.companyId, world.companyId),
            eq(auditLogs.action, WHATSAPP_COMMAND_SETTLEMENT_AUDIT.abandoned),
          ),
        )
      expect(trail.map((row) => [row.entityId, row.actorUserId, row.result, row.reason])).toEqual([
        [requestId, world.userId, 'failed', 'Error'],
      ])
      expect(JSON.stringify(trail)).not.toContain('connection reset')
    },
    240_000,
  )
})

type SeededWorld = {
  readonly actor: AuthenticatedContext<CompanyContext>
  readonly companyId: string
  readonly cteProfileId: string
  readonly documentIdByNumber: ReadonlyMap<number, string>
  readonly freightRuleId: string
  readonly membershipId: string
  readonly userId: string
}

function buildScenario(
  db: Database,
  overrides: { readonly billing?: SettleWhatsAppCommandDependencies['billing'] } = {},
) {
  const fingerprints = createIdempotencyFingerprintService({ key: new Uint8Array(32).fill(9) })
  const cteBatches = createCteBatchUseCase({
    fingerprintService: fingerprints,
    profiles: new DrizzleCteEmissionProfileCatalogRepository(
      new DrizzleCteEmissionProfileRepository(db),
    ),
    unitOfWork: new DrizzleCteBatchRepository(db),
  })
  const cteIssuance = createCteIssuanceUseCase({
    documentDownload: createCteDocumentDownloadGateway({ storage: NOT_STORAGE }),
    fingerprintService: fingerprints,
    unitOfWork: new DrizzleCteIssuanceRepository(db),
  })
  const nfseInvoiceRepository = new DrizzleNfseInvoiceRepository(db)
  const nfseInvoices = createNfseInvoiceUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const commands = new DrizzleWhatsAppCommandRepository(db)
  const deps = {
    authorization: new AuthorizationService(),
    classifier: new DrizzleNfeDocumentRepository(db, NOT_STORAGE),
    clock: () => new Date(),
    commands,
    createCteBatch: (input: Parameters<typeof cteBatches.create>[0]) => cteBatches.create(input),
    createNfseInvoice: (input: Parameters<typeof nfseInvoices.create>[0]) =>
      nfseInvoices.create(input),
    findNfseCredentialGap: createNfseCredentialGapFinder(nfseInvoiceRepository),
    generateId: () => crypto.randomUUID(),
    issueCteBatch: (input: Parameters<typeof cteIssuance.issue>[0]) => cteIssuance.issue(input),
    previewNfseInvoices: (input: Parameters<typeof nfseInvoices.preview>[0]) =>
      nfseInvoices.preview(input),
    selection: new DrizzleDocumentSelectionRepository(db),
  }
  const confirmation = createConfirmDocumentSelectionUseCase(deps)
  const tenantContext = new TenantContextService({
    repository: new DrizzleMembershipRepository(db),
  })
  const settle = createSettleWhatsAppCommandUseCase({
    authorization: new AuthorizationService(),
    billing:
      overrides.billing ??
      createBillingUseCase({
        clock: { now: () => new Date().toISOString() },
        fingerprintService: fingerprints,
        unitOfWork: new DrizzleBillingRepository(db),
      }),
    clock: () => new Date(),
    commands,
    documents: new DrizzleWhatsAppCommandSettlementRepository(db),
    logger: SILENT_LOGGER,
    resolveActor: (input) => tenantContext.resolveCompanyForUser({ ...input, channel: 'whatsapp' }),
    resume: (input) => confirmation.resume(input),
  })
  return { confirmation, preview: createPreviewDocumentSelectionUseCase(deps), settle }
}

async function freezeAndConfirm(
  scenario: ReturnType<typeof buildScenario>,
  world: SeededWorld,
  numbers: readonly number[],
): Promise<string> {
  const outcome = await scenario.preview({
    context: world.actor.scope,
    criterion: {
      emitterTaxId: EMITTER_TAX_ID,
      firstNumber: Math.min(...numbers),
      kind: 'number_range',
      lastNumber: Math.max(...numbers),
      series: '1',
    },
    dueDays: 15,
    period: 'setembro/2026',
  })
  if (outcome.kind !== 'previewed') throw new Error(`a prévia não congelou: ${outcome.kind}`)
  expect(outcome.volumetry).toMatchObject({ blockedCount: 0, cte: numbers.length })

  const confirmed = await scenario.confirmation.confirm({
    actor: world.actor,
    requestId: outcome.requestId,
  })
  expect(confirmed).toEqual({ failures: [], issued: 1, kind: 'dispatched' })
  return outcome.requestId
}

/** O que o worker gravaria depois da SEFAZ: 1238 rejeitada com o motivo, o resto autorizado. */
async function answerFromSefaz(db: Database, world: SeededWorld): Promise<void> {
  const attempts = await db
    .select({
      attemptId: cteIssuanceAttempts.id,
      batchItemId: cteIssuanceAttempts.batchItemId,
      nfeDocumentId: cteBatchItems.nfeDocumentId,
    })
    .from(cteIssuanceAttempts)
    .innerJoin(
      cteBatchItems,
      and(
        eq(cteBatchItems.companyId, cteIssuanceAttempts.companyId),
        eq(cteBatchItems.id, cteIssuanceAttempts.batchItemId),
      ),
    )
    .where(eq(cteIssuanceAttempts.companyId, world.companyId))
  expect(attempts).toHaveLength(world.documentIdByNumber.size)
  const numberByDocument = new Map(
    [...world.documentIdByNumber].map(([number, documentId]) => [documentId, number]),
  )

  for (const [index, attempt] of attempts.entries()) {
    const number = numberByDocument.get(attempt.nfeDocumentId) ?? 0
    if (number === REJECTED_NUMBER) {
      await db
        .update(cteIssuanceAttempts)
        .set({
          lastErrorCause: 'Rejeicao: Duplicidade de CT-e',
          lastErrorCode: '539',
          status: 'rejected',
        })
        .where(eq(cteIssuanceAttempts.id, attempt.attemptId))
      continue
    }
    await authorizeAttempt(db, { ...attempt, companyId: world.companyId, index, number })
  }
}

async function authorizeAttempt(
  db: Database,
  input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly index: number
    readonly number: number
  },
): Promise<void> {
  const xmlObjectId = crypto.randomUUID()
  await db
    .update(cteIssuanceAttempts)
    .set({ status: 'authorized' })
    .where(eq(cteIssuanceAttempts.id, input.attemptId))
  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `cte/${input.companyId}/${input.attemptId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(cteFiscalDocuments).values({
    accessKey: `352609${CARRIER_TAX_ID_ROOT}000199570010${String(input.number).padStart(9, '0')}10000000${input.index % 10}`,
    attemptId: input.attemptId,
    authorizationProtocol: `protocol-${input.attemptId}`,
    authorizedAt: new Date(),
    batchItemId: input.batchItemId,
    companyId: input.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: BigInt(input.index + 1),
    fiscalSeries: '1',
    status: 'authorized',
    xmlObjectId,
    xmlSha256: SHA,
  })
}

/** A NFS-e do pedido, já autorizada pela prefeitura, com o passo dela no diário. */
async function seedAuthorizedNfse(
  db: Database,
  world: SeededWorld,
  requestId: string,
): Promise<void> {
  const nfseProfileId = crypto.randomUUID()
  const invoiceId = crypto.randomUUID()
  await db.insert(nfseEmissionProfiles).values({
    chargeComponentLabel: 'Frete',
    cnaeCode: '4930202',
    companyId: world.companyId,
    createdByUserId: world.userId,
    descriptionTemplate: 'Transporte {{periodo}}',
    freightRuleId: world.freightRuleId,
    id: nfseProfileId,
    municipalityIbgeCode: '3543402',
    municipalityName: 'Ribeirao Preto',
    name: 'NFS-e T014',
    serviceListItem: '1602',
    status: 'active',
    taker: '3',
  })
  await db.insert(nfseServiceInvoices).values({
    authorizedAt: new Date(),
    calculationSnapshot: {},
    companyId: world.companyId,
    createdByUserId: world.userId,
    description: 'Transporte setembro/2026',
    emissionProfileId: nfseProfileId,
    id: invoiceId,
    providerDocumentId: `nota-${invoiceId}`,
    serviceAmount: '100.00',
    status: 'authorized',
    takerLegalName: 'Destinatario B Ltda',
    takerTaxId: TAKER_B,
  })
  await new DrizzleWhatsAppCommandRepository(db).recordJournalStep({
    companyId: world.companyId,
    documentId: invoiceId,
    documentKind: 'nfse_invoice',
    groupKey: `${nfseProfileId}:${TAKER_B}`,
    idempotencyKey: `whatsapp:${requestId}:nfse:${nfseProfileId}:${TAKER_B}`,
    requestId,
    status: 'issued',
  })
}

async function countRows(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ id: billingInvoices.id })
    .from(billingInvoices)
    .where(eq(billingInvoices.companyId, companyId))
  return rows.length
}

async function countActiveItems(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ id: billingInvoiceItems.id })
    .from(billingInvoiceItems)
    .where(
      and(eq(billingInvoiceItems.companyId, companyId), isNull(billingInvoiceItems.cancelledAt)),
    )
  return rows.length
}

function toDay(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

async function seedCompany(db: Database, numbers: readonly number[]): Promise<SeededWorld> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await db.insert(companies).values({ id: companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: userId, status: 'active' })
  await db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await db.insert(membershipRoles).values({ membershipId, role: 'company-admin' })
  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${companyId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${companyId}`,
    id: importId,
    idempotencyKey: `import-${companyId}`,
    requestFingerprint: `fingerprint-${companyId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  const { cteProfileId, freightRuleId } = await seedProfile(db, { companyId, userId })
  await seedFiscalProfile(db, companyId)

  const documentIds: string[] = []
  // Em série: dezenas de inserts concorrentes no pool de 10 do Bun SQL podem nunca voltar (variante do dd3515c6).
  for (const number of numbers) {
    documentIds.push(await seedDocument(db, { companyId, importId, number, userId, xmlObjectId }))
  }
  return {
    actor: {
      identity: {
        channel: 'whatsapp',
        companyIdClaim: companyId,
        externalIdentityId: 'external',
        issuer: 'https://keycloak.example/realms/transportada',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'subject',
        userId,
      },
      scope: {
        companyId,
        kind: 'company',
        membershipId,
        permissions: new Set(PERMISSIONS),
        roles: ['company-admin'],
        userId,
      },
    },
    companyId,
    cteProfileId,
    documentIdByNumber: new Map(numbers.map((number, index) => [number, documentIds[index] ?? ''])),
    freightRuleId,
    membershipId,
    userId,
  }
}

/** Tomador `3`: o destinatário paga o frete, e é por ele que as notas se dividem em duas faturas. */
async function seedProfile(
  db: Database,
  input: { readonly companyId: string; readonly userId: string },
): Promise<{ readonly cteProfileId: string; readonly freightRuleId: string }> {
  const { companyId, userId } = input
  const freightRuleId = crypto.randomUUID()
  const cteProfileId = crypto.randomUUID()
  await db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete T014',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: userId,
    filters: {},
    freightRuleId,
    id: crypto.randomUUID(),
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await db.insert(cteEmissionProfiles).values({
    cfopInternal: '5353',
    cfopInterstate: '6353',
    chargeComponentLabel: 'FRETE PESO',
    companyId,
    createdByUserId: userId,
    freightRuleId,
    groupingMode: 'per_invoice',
    icmsCst: '00',
    icmsRate: '0.120000',
    id: cteProfileId,
    matchMode: 'sender_tax_id',
    name: 'Perfil CT-e T014',
    nfseEmissionProfileId: null,
    operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    outputDocument: 'cte',
    predominantProductMode: 'highest_value',
    receiverIeIndicator: '1',
    status: 'active',
    taker: '3',
  })
  await db.insert(cteEmissionProfileMatchers).values({
    companyId,
    matchRole: 'sender',
    profileId: cteProfileId,
    taxId: EMITTER_TAX_ID.slice(0, 8),
  })
  return { cteProfileId, freightRuleId }
}

/** O CNPJ da transportadora é único na instalação: cada cenário semeia o seu. */
async function seedFiscalProfile(db: Database, companyId: string): Promise<void> {
  const carrierTaxId = `${CARRIER_TAX_ID_ROOT}${randomDigits(6)}`
  await db.insert(companyFiscalProfiles).values({
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: carrierTaxId,
    companyId,
    complement: '',
    district: 'Centro',
    email: 'fiscal@example.test',
    environment: 'homologation',
    legalName: 'Transportadora T014 Ltda',
    municipalRegistration: '123456',
    number: '100',
    phone: '1630000000',
    postalCode: '14000000',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '110000000000',
    street: 'Rua da Transportadora',
    taxRegime: '1',
    tradeName: 'Transportadora T014',
  })
  await db.insert(fiscalSequences).values({
    companyId,
    environment: 'homologation',
    model: 'cte',
    nextNumber: 1n,
    series: 1n,
  })
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

async function seedDocument(
  db: Database,
  input: {
    readonly companyId: string
    readonly importId: string
    readonly number: number
    readonly userId: string
    readonly xmlObjectId: string
  },
): Promise<string> {
  const documentId = crypto.randomUUID()
  const emitterId = crypto.randomUUID()
  const recipientId = crypto.randomUUID()
  const number = String(input.number)
  const recipientTaxId = input.number % 2 === 0 ? TAKER_A : TAKER_B

  await db.insert(nfeDocuments).values({
    accessKey: `352609${EMITTER_TAX_ID}55001${number.padStart(9, '0')}1000000010`,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId: input.importId,
    issuedAt: new Date('2026-09-10T12:00:00.000Z'),
    model: '55',
    number,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId: input.xmlObjectId,
    xmlSha256: SHA,
  })
  await db.insert(nfeParticipants).values([
    {
      companyId: input.companyId,
      documentId,
      id: emitterId,
      legalName: 'Emitente T014 Ltda',
      role: 'emitter',
      stateRegistration: '110000000110',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: input.companyId,
      documentId,
      id: recipientId,
      legalName: recipientTaxId === TAKER_A ? 'Destinatario A Ltda' : 'Destinatario B Ltda',
      role: 'recipient',
      stateRegistration: 'ISENTO',
      taxId: recipientTaxId,
    },
  ])
  await db
    .insert(nfeAddresses)
    .values([
      buildAddress(input.companyId, emitterId, { city: 'Sao Paulo', cityCode: '3550308' }),
      buildAddress(input.companyId, recipientId, { city: 'Rio de Janeiro', cityCode: '3304557' }),
    ])
  await db.insert(nfeProducts).values({
    cfop: '5102',
    code: `PROD-${number}`,
    commercialUnit: 'UN',
    companyId: input.companyId,
    description: 'PRODUTO SINTETICO',
    documentId,
    ncm: '84713012',
    ordinal: 1n,
    quantity: '4.0000',
    totalValue: '1000.0000',
    unitValue: '250.0000',
  })
  await db.insert(nfeVolumes).values({
    companyId: input.companyId,
    documentId,
    grossWeight: '120.0000',
    netWeight: '100.0000',
    ordinal: 1n,
    quantity: '4.0000',
  })
  return documentId
}

function buildAddress(
  companyId: string,
  participantId: string,
  place: { readonly city: string; readonly cityCode: string },
) {
  return {
    city: place.city,
    cityCode: place.cityCode,
    companyId,
    district: 'Centro',
    number: '100',
    participantId,
    postalCode: '01000000',
    state: place.cityCode.startsWith('33') ? 'RJ' : 'SP',
    street: 'Rua das Amostras',
  }
}

function requireDatabase(): Database {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  return shared.database.db
}
