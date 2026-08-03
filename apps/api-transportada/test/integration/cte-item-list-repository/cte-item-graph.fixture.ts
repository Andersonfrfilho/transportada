/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { CTE_ISSUANCE_STATUSES } from '../../../src/database/cte-issuance.schema'
import { runDatabaseMigrations } from '../../../src/database/database-migration.service'
import {
  companies,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  fiscalSequenceReservations,
  fiscalSequences,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../../src/database/database.schema'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

export const testWithPostgres = databaseUrl === undefined ? test.skip : test

export type TestDatabase = ReturnType<typeof createDrizzleProvider>

type DocumentShape = 'authorized' | 'cancellation_requested' | 'cancelled' | null

export type CteIssuanceStatus = (typeof CTE_ISSUANCE_STATUSES)[number]

export type ItemScenario = {
  /** Da mais antiga para a mais recente: a última é o estado corrente do CT-e. */
  readonly attemptStatuses: readonly CteIssuanceStatus[]
  readonly document: DocumentShape
  readonly expectedStatus: CteIssuanceStatus
  readonly key: string
}

/** Números sintéticos — nenhuma nota real entra em fixture. */
export const BASE_INVOICE_NUMBER = 900_000
export const EXTRA_INVOICE_NUMBER = '900900'
export const BASE_FISCAL_NUMBER = 5_000

export const ITEM_SCENARIOS: readonly ItemScenario[] = [
  { attemptStatuses: [], document: null, expectedStatus: 'pending', key: 'sem_tentativa' },
  { attemptStatuses: ['pending'], document: null, expectedStatus: 'pending', key: 'pendente' },
  { attemptStatuses: ['in_flight'], document: null, expectedStatus: 'in_flight', key: 'em_voo' },
  {
    attemptStatuses: ['in_flight', 'rejected'],
    document: null,
    expectedStatus: 'rejected',
    key: 'rejeitada',
  },
  { attemptStatuses: ['failed'], document: null, expectedStatus: 'failed', key: 'falhou' },
  {
    attemptStatuses: ['retry_scheduled'],
    document: null,
    expectedStatus: 'retry_scheduled',
    key: 'reagendada',
  },
  {
    attemptStatuses: ['reconciliation_required'],
    document: null,
    expectedStatus: 'reconciliation_required',
    key: 'reconciliar',
  },
  {
    attemptStatuses: ['authorized'],
    document: 'authorized',
    expectedStatus: 'authorized',
    key: 'autorizada',
  },
  // A janela entre a tentativa autorizada e a gravação do documento é real: o status já é autorizado.
  {
    attemptStatuses: ['authorized'],
    document: null,
    expectedStatus: 'authorized',
    key: 'autorizada_sem_documento',
  },
  // ADR-0018: documento gravado manda sobre uma tentativa recusada depois da autorização.
  {
    attemptStatuses: ['authorized', 'rejected'],
    document: 'authorized',
    expectedStatus: 'authorized',
    key: 'autorizada_e_depois_rejeitada',
  },
  {
    attemptStatuses: ['authorized'],
    document: 'cancellation_requested',
    expectedStatus: 'cancelled',
    key: 'cancelamento_solicitado',
  },
  {
    attemptStatuses: ['authorized', 'cancelled'],
    document: 'cancelled',
    expectedStatus: 'cancelled',
    key: 'cancelada',
  },
  {
    attemptStatuses: ['authorized', 'cancelled'],
    document: null,
    expectedStatus: 'cancelled',
    key: 'cancelada_sem_documento',
  },
]

/** O último cenário da lista recebe a segunda nota, para a faixa de número de nota não multiplicar linha. */
export const TWO_INVOICE_SCENARIO_KEY = 'sem_tentativa'

export type SeededCompany = {
  readonly companyId: string
  readonly fiscalNumberByScenario: ReadonlyMap<string, string>
  readonly itemIdByScenario: ReadonlyMap<string, string>
}

export async function withCteItemGraph(
  operation: (input: {
    readonly database: TestDatabase
    readonly primary: SeededCompany
    readonly secondary: SeededCompany
  }) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (database) => {
    const userId = crypto.randomUUID()
    await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
    const primary = await seedCompanyGraph(database, { suffix: '1', userId })
    const secondary = await seedCompanyGraph(database, { suffix: '2', userId })
    await operation({ database, primary, secondary })
  })
}

async function seedCompanyGraph(
  database: TestDatabase,
  input: { readonly suffix: string; readonly userId: string },
): Promise<SeededCompany> {
  const companyId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeXmlObjectId = crypto.randomUUID()
  const cteXmlObjectId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: input.userId,
  })
  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId,
      id: nfeXmlObjectId,
      mimeType: 'application/xml',
      objectKey: `nfe/${input.suffix}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId,
      id: cteXmlObjectId,
      mimeType: 'application/xml',
      objectKey: `cte/${input.suffix}.xml`,
      provider: 's3',
      purpose: 'cte_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-import-${input.suffix}`,
    id: importId,
    idempotencyKey: `import-${input.suffix}`,
    requestFingerprint: `fingerprint-import-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: `Frete ${input.suffix}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId,
    id: freightRuleVersionId,
    percentage: '0.045000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(cteBatches).values({
    companyId,
    correlationId: `correlation-batch-${input.suffix}`,
    id: batchId,
    idempotencyFingerprint: `fingerprint-batch-${input.suffix}`,
    idempotencyKey: `batch-${input.suffix}`,
    name: `Lote ${input.suffix}`,
    operatorUserId: input.userId,
    status: 'submitted',
    version: 1n,
  })
  await database.db.insert(fiscalSequences).values({
    companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId,
    fiscalSequenceId,
    id: reservationId,
    number: 1n,
    reservationKey: `reservation-${input.suffix}`,
  })

  const itemIdByScenario = new Map<string, string>()
  const fiscalNumberByScenario = new Map<string, string>()
  for (const [index, scenario] of ITEM_SCENARIOS.entries()) {
    const itemId = await seedScenarioItem(database, {
      batchId,
      companyId,
      freightRuleId,
      freightRuleVersionId,
      importId,
      index,
      nfeXmlObjectId,
      scenario,
      sha,
      suffix: input.suffix,
      userId: input.userId,
    })
    itemIdByScenario.set(scenario.key, itemId)
    fiscalNumberByScenario.set(scenario.key, String(BASE_FISCAL_NUMBER + index))
    await seedScenarioIssuance(database, {
      batchId,
      companyId,
      cteXmlObjectId,
      index,
      itemId,
      reservationId,
      scenario,
      sha,
      suffix: input.suffix,
    })
  }

  return { companyId, fiscalNumberByScenario, itemIdByScenario }
}

type SeedScenarioItemInput = {
  readonly batchId: string
  readonly companyId: string
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly importId: string
  readonly index: number
  readonly nfeXmlObjectId: string
  readonly scenario: ItemScenario
  readonly sha: string
  readonly suffix: string
  readonly userId: string
}

async function seedScenarioItem(
  database: TestDatabase,
  input: SeedScenarioItemInput,
): Promise<string> {
  const itemId = crypto.randomUUID()
  const primaryDocumentId = await insertInvoice(database, {
    ...input,
    accessKeyOffset: 100 + input.index,
    number: String(BASE_INVOICE_NUMBER + input.index),
  })
  const freightCalculationId = crypto.randomUUID()

  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '1000.0000',
    calculatedAmount: '45.0000',
    calculationDetails: {},
    companyId: input.companyId,
    correlationId: `correlation-freight-${input.suffix}-${input.index}`,
    createdByUserId: input.userId,
    freightRuleId: input.freightRuleId,
    freightRuleVersionId: input.freightRuleVersionId,
    id: freightCalculationId,
    idempotencyKey: `freight-${input.suffix}-${input.index}`,
    nfeDocumentId: primaryDocumentId,
    percentage: '0.045000',
    requestFingerprint: `fingerprint-freight-${input.suffix}-${input.index}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '45.0000',
  })
  await database.db.insert(cteBatchItems).values({
    batchId: input.batchId,
    calculationSnapshot: {
      baseAmount: '1000.0000',
      calculatedAmount: '45.0000',
      fiscalAmount: '45.00',
    },
    companyId: input.companyId,
    createdAt: new Date(Date.UTC(2026, 6, 20, 12, input.index)),
    freightCalculationId,
    id: itemId,
    nfeDocumentId: primaryDocumentId,
    position: BigInt(input.index + 1),
  })
  await database.db.insert(cteBatchItemDocuments).values({
    batchId: input.batchId,
    companyId: input.companyId,
    id: crypto.randomUUID(),
    itemId,
    nfeDocumentId: primaryDocumentId,
    position: 1n,
  })
  if (input.scenario.key === TWO_INVOICE_SCENARIO_KEY) {
    const extraDocumentId = await insertInvoice(database, {
      ...input,
      accessKeyOffset: 300 + input.index,
      number: EXTRA_INVOICE_NUMBER,
    })
    await database.db.insert(cteBatchItemDocuments).values({
      batchId: input.batchId,
      companyId: input.companyId,
      id: crypto.randomUUID(),
      itemId,
      nfeDocumentId: extraDocumentId,
      position: 2n,
    })
  }

  return itemId
}

async function insertInvoice(
  database: TestDatabase,
  input: SeedScenarioItemInput & { readonly accessKeyOffset: number; readonly number: string },
): Promise<string> {
  const documentId = crypto.randomUUID()
  await database.db.insert(nfeDocuments).values({
    accessKey: buildDigits(input.suffix, input.accessKeyOffset),
    authorizationProtocol: `protocol-nfe-${input.suffix}-${input.accessKeyOffset}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId: input.importId,
    issuedAt: new Date('2026-07-20T12:00:00.000Z'),
    model: '55',
    number: input.number,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId: input.nfeXmlObjectId,
    xmlSha256: input.sha,
  })

  return documentId
}

type SeedScenarioIssuanceInput = {
  readonly batchId: string
  readonly companyId: string
  readonly cteXmlObjectId: string
  readonly index: number
  readonly itemId: string
  readonly reservationId: string
  readonly scenario: ItemScenario
  readonly sha: string
  readonly suffix: string
}

async function seedScenarioIssuance(
  database: TestDatabase,
  input: SeedScenarioIssuanceInput,
): Promise<void> {
  const fiscalNumber = BigInt(BASE_FISCAL_NUMBER + input.index)
  let lastAttemptId: string | undefined
  for (const [attemptIndex, status] of input.scenario.attemptStatuses.entries()) {
    const attemptId = crypto.randomUUID()
    const label = `${input.suffix}-${input.scenario.key}-${attemptIndex}`
    await database.db.insert(cteIssuanceAttempts).values({
      attemptKind: status === 'cancelled' ? 'cancel' : 'issue',
      attemptNumber: BigInt(attemptIndex + 1),
      batchId: input.batchId,
      batchItemId: input.itemId,
      companyId: input.companyId,
      correlationId: `correlation-cte-${label}`,
      fiscalEnvironment: 'homologation',
      fiscalNumber,
      fiscalSeries: '1',
      id: attemptId,
      idempotencyFingerprint: `fingerprint-cte-${label}`,
      idempotencyKey: `cte-${label}`,
      requestFingerprint: `request-cte-${label}`,
      reservationId: input.reservationId,
      status,
    })
    lastAttemptId = attemptId
  }
  if (input.scenario.document === null) return
  if (lastAttemptId === undefined) throw new Error('DOCUMENT_REQUIRES_ATTEMPT')

  const isCancelled = input.scenario.document === 'cancelled'
  const isCancellationRequested = input.scenario.document === 'cancellation_requested'
  await database.db.insert(cteFiscalDocuments).values({
    accessKey: buildDigits(input.suffix, 200 + input.index),
    attemptId: lastAttemptId,
    authorizationProtocol: `protocol-cte-${input.suffix}-${input.index}`,
    authorizedAt: new Date('2026-07-20T20:00:00.000Z'),
    batchItemId: input.itemId,
    cancellationJustification: isCancelled ? 'Cancelamento de teste de integracao' : null,
    cancellationProtocol: isCancelled ? `cancel-protocol-${input.suffix}-${input.index}` : null,
    cancellationRequestedAt:
      isCancelled || isCancellationRequested ? new Date('2026-07-21T10:00:00.000Z') : null,
    cancelledAt: isCancelled ? new Date('2026-07-21T10:05:00.000Z') : null,
    companyId: input.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber,
    fiscalSeries: '1',
    id: crypto.randomUUID(),
    status: isCancelled ? 'cancelled' : 'authorized',
    xmlObjectId: input.cteXmlObjectId,
    xmlSha256: input.sha,
  })
}

function buildDigits(suffix: string, offset: number): string {
  return `${suffix}${String(offset).padStart(43, '0')}`
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t006_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Identificador de banco descartável não pode ser parametrizado.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
