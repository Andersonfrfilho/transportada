/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — a confirmação contra Postgres, pelos casos de uso reais de lote, emissão e NFS-e.
 * Nenhuma chamada fiscal sai daqui: o `issue` e a NFS-e só gravam tentativa e outbox, e quem fala
 * com a SEFAZ e a prefeitura é o worker, fora deste teste.
 *
 * - AC4: a nota que entra em outro lote entre a prévia e o toque faz a confirmação pedir prévia nova;
 * - AC5: dois toques simultâneos produzem um lote por perfil;
 * - retomada: queda entre `created` e `issue` não duplica lote nem emissão.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, like } from 'drizzle-orm'

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
  companies,
  companyFiscalProfiles,
  cteBatches,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  cteIssuanceAttempts,
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
  nfseProviderCredentials,
  nfseServiceInvoices,
  storedObjects,
  userCompanyMemberships,
  whatsAppCommandDocuments,
  whatsAppCommandRequests,
} from '../../src/database/database.schema.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case.js'
import { DrizzleNfseInvoiceRepository } from '../../src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import {
  type ConfirmDocumentSelectionDependencies,
  createConfirmDocumentSelectionUseCase,
} from '../../src/whatsapp-commands/application/confirm-document-selection.use-case.js'
import { createPreviewDocumentSelectionUseCase } from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import { createNfseCredentialGapFinder } from '../../src/whatsapp-commands/application/preview-nfse-blocks.service.js'
import { DrizzleDocumentSelectionRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-document-selection.repository.js'
import { DrizzleWhatsAppCommandRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const NOT_STORAGE = {} as NfeStorageGateway
const SHA = 'd'.repeat(64)
const EMITTER_TAX_ID = '11222333000181'
const RECIPIENT_CTE_TAX_ID = '44555666000109'
const RECIPIENT_NFSE_TAX_ID = '77888999000105'
const CARRIER_TAX_ID_ROOT = '12345678'
const CTE_NUMBERS = [1200, 1201, 1202, 1203]
const NFSE_NUMBERS = [1204, 1205]
const PERMISSIONS: readonly CompanyPermission[] = ['cte.manage', 'cte.submit', 'nfse.issue']

let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_t013_${crypto.randomUUID().replaceAll('-', '')}`
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

describe('confirmar é emitir o que foi visto (spec 144 T013, AC4 e AC5)', () => {
  testWithPostgres(
    'AC4 — nota que entra em outro lote entre a prévia e o toque pede prévia nova, e nada emite',
    async () => {
      const db = requireDatabase()
      const world = await seedCompany(db)
      const scenario = buildScenario(db)
      const requestId = await freeze(scenario, world)

      // Pelo painel, com a mesma porta de sempre: a nota 1200 entra num lote antes do toque.
      await scenario.cteBatches.create({
        context: { companyId: world.companyId, userId: world.userId },
        correlationId: 'panel-ac4',
        documentIds: [world.documentIdByNumber.get(1200) ?? ''],
        emissionProfileId: world.cteProfileId,
        idempotencyKey: 'panel-ac4-batch-key',
        name: 'Lote do painel',
      })

      const outcome = await scenario.confirmation.confirm({ actor: world.actor, requestId })
      if (outcome.kind !== 'superseded')
        throw new Error(`esperava superseded, veio ${outcome.kind}`)
      expect(outcome.next.kind).toBe('previewed')

      const [original] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect(original?.status).toBe('superseded')
      expect(await countWhatsAppBatches(db, world.companyId)).toBe(0)
      expect(await countRows(db, nfseServiceInvoices, world.companyId)).toBe(0)
      expect(
        await db
          .select()
          .from(whatsAppCommandDocuments)
          .where(eq(whatsAppCommandDocuments.companyId, world.companyId)),
      ).toEqual([])

      if (outcome.next.kind !== 'previewed') return
      const [fresh] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, outcome.next.requestId))
      expect(fresh?.status).toBe('previewed')
      expect(fresh?.period).toBe(original?.period)
      expect(fresh?.dueDate).toBe(original?.dueDate)
      const linked = fresh?.classification.find(
        (entry) => entry.documentId === world.documentIdByNumber.get(1200),
      )
      expect(linked?.classification).toEqual({
        output: 'blocked',
        reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      })
    },
    120_000,
  )

  testWithPostgres(
    'AC5 — dois toques simultâneos: um lote por perfil, uma NFS-e por tomador, e o terceiro converge',
    async () => {
      const db = requireDatabase()
      const world = await seedCompany(db)
      const scenario = buildScenario(db)
      const requestId = await freeze(scenario, world)

      const outcomes = await Promise.all([
        scenario.confirmation.confirm({ actor: world.actor, requestId }),
        scenario.confirmation.confirm({ actor: world.actor, requestId }),
      ])
      const kinds = outcomes.map((outcome) => outcome.kind)
      expect(kinds.filter((kind) => kind === 'dispatched')).toHaveLength(1)
      const loser = kinds.find((kind) => kind !== 'dispatched') ?? 'missing'
      expect(['in_progress', 'already_dispatched']).toContain(loser)

      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.id, requestId))
      expect(request?.status).toBe('dispatched')
      const journal = await readJournal(db, world.companyId, requestId)
      expect(journal.map((step) => [step.documentKind, step.status])).toEqual([
        ['cte_batch', 'issued'],
        ['nfse_invoice', 'issued'],
      ])
      expect(journal.map((step) => step.idempotencyKey)).toEqual([
        `whatsapp:${requestId}:cte:${world.cteProfileId}`,
        `whatsapp:${requestId}:nfse:${world.nfseProfileId}:${RECIPIENT_NFSE_TAX_ID}`,
      ])

      expect(await countWhatsAppBatches(db, world.companyId)).toBe(1)
      expect(await countRows(db, nfseServiceInvoices, world.companyId)).toBe(1)
      const [batch] = await db
        .select()
        .from(cteBatches)
        .where(eq(cteBatches.companyId, world.companyId))
      expect(batch?.name).toBe(`WhatsApp ${requestId.slice(0, 8)} · Perfil CT-e T013`)
      expect(batch?.status).not.toBe('draft')
      const attempts = await countRows(db, cteIssuanceAttempts, world.companyId)
      expect(attempts).toBe(CTE_NUMBERS.length)

      // Terceiro toque, com rede ruim: responde com o estado e não cria nada.
      expect(await scenario.confirmation.confirm({ actor: world.actor, requestId })).toEqual({
        kind: 'already_dispatched',
      })
      expect(await countWhatsAppBatches(db, world.companyId)).toBe(1)
      expect(await countRows(db, cteIssuanceAttempts, world.companyId)).toBe(attempts)
    },
    120_000,
  )

  testWithPostgres(
    'retomada — queda entre created e issue não duplica lote nem emissão',
    async () => {
      const db = requireDatabase()
      // Com NFS-e no mesmo pedido: a queda antes do primeiro `issue` deixa o lote `created` e a
      // NFS-e `pending`, e a retomada emite as duas.
      const world = await seedCompany(db)
      let crashes = 1
      const scenario = buildScenario(db, {
        beforeIssue: () => {
          if (crashes === 0) return
          crashes -= 1
          throw new Error('connection terminated')
        },
      })
      const requestId = await freeze(scenario, world)

      await expect(
        scenario.confirmation.confirm({ actor: world.actor, requestId }),
      ).rejects.toThrow('connection terminated')
      const stuck = await readJournal(db, world.companyId, requestId)
      expect(stuck.map((step) => step.status)).toEqual(['created', 'pending'])
      expect(await countRows(db, cteIssuanceAttempts, world.companyId)).toBe(0)

      const outcome = await scenario.confirmation.resume({ actor: world.actor, requestId })
      expect(outcome).toEqual({ failures: [], issued: 2, kind: 'dispatched' })
      expect(await countRows(db, nfseServiceInvoices, world.companyId)).toBe(1)
      expect(await countWhatsAppBatches(db, world.companyId)).toBe(1)
      expect(await countRows(db, cteIssuanceAttempts, world.companyId)).toBe(CTE_NUMBERS.length)
      const [resumedBatch] = await readJournal(db, world.companyId, requestId)
      expect(resumedBatch?.documentId).toEqual(stuck[0]?.documentId)

      // Retomar de novo, já despachado, não emite nada.
      expect(await scenario.confirmation.resume({ actor: world.actor, requestId })).toEqual({
        kind: 'already_dispatched',
      })
      expect(await countRows(db, cteIssuanceAttempts, world.companyId)).toBe(CTE_NUMBERS.length)
    },
    120_000,
  )
})

type SeededWorld = {
  readonly actor: AuthenticatedContext<CompanyContext>
  readonly companyId: string
  readonly cteProfileId: string
  readonly documentIdByNumber: ReadonlyMap<number, string>
  readonly nfseProfileId: string
  readonly userId: string
}

function buildScenario(db: Database, hooks: { readonly beforeIssue?: () => void } = {}) {
  const fingerprints = createIdempotencyFingerprintService({ key: new Uint8Array(32).fill(7) })
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
  const deps: ConfirmDocumentSelectionDependencies = {
    authorization: new AuthorizationService(),
    classifier: new DrizzleNfeDocumentRepository(db, NOT_STORAGE),
    clock: () => new Date(),
    commands: new DrizzleWhatsAppCommandRepository(db),
    createCteBatch: (input) => cteBatches.create(input),
    createNfseInvoice: (input) => nfseInvoices.create(input),
    findNfseCredentialGap: createNfseCredentialGapFinder(nfseInvoiceRepository),
    generateId: () => crypto.randomUUID(),
    issueCteBatch: async (input) => {
      hooks.beforeIssue?.()
      return cteIssuance.issue(input)
    },
    previewNfseInvoices: (input) => nfseInvoices.preview(input),
    selection: new DrizzleDocumentSelectionRepository(db),
  }
  return {
    confirmation: createConfirmDocumentSelectionUseCase(deps),
    cteBatches,
    preview: createPreviewDocumentSelectionUseCase(deps),
  }
}

async function freeze(
  scenario: ReturnType<typeof buildScenario>,
  world: SeededWorld,
): Promise<string> {
  const outcome = await scenario.preview({
    context: world.actor.scope,
    criterion: {
      emitterTaxId: EMITTER_TAX_ID,
      firstNumber: Math.min(...CTE_NUMBERS),
      kind: 'number_range',
      lastNumber: Math.max(...NFSE_NUMBERS),
      series: '1',
    },
    dueDays: 15,
    period: 'setembro/2026',
  })
  if (outcome.kind !== 'previewed') throw new Error(`a prévia não congelou: ${outcome.kind}`)
  expect(outcome.volumetry).toMatchObject({
    blockedCount: 0,
    total: world.documentIdByNumber.size,
  })
  return outcome.requestId
}

async function readJournal(db: Database, companyId: string, requestId: string) {
  return new DrizzleWhatsAppCommandRepository(db).listJournal({ companyId, requestId })
}

async function countWhatsAppBatches(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ id: cteBatches.id })
    .from(cteBatches)
    .where(and(eq(cteBatches.companyId, companyId), like(cteBatches.idempotencyKey, 'whatsapp:%')))
  return rows.length
}

async function countRows(
  db: Database,
  table: typeof cteIssuanceAttempts | typeof nfseServiceInvoices,
  companyId: string,
): Promise<number> {
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.companyId, companyId))
  return rows.length
}

async function seedCompany(
  db: Database,
  input: { readonly withNfse?: boolean } = {},
): Promise<SeededWorld> {
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
  const profiles = await seedProfiles(db, { companyId, userId })

  const numbers = input.withNfse === false ? CTE_NUMBERS : [...CTE_NUMBERS, ...NFSE_NUMBERS]
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
    documentIdByNumber: new Map(numbers.map((number, index) => [number, documentIds[index] ?? ''])),
    ...profiles,
    userId,
  }
}

/** O CT-e casa pela raiz do emitente; a NFS-e pelo destinatário B completo, que vence a raiz. */
async function seedProfiles(
  db: Database,
  input: { readonly companyId: string; readonly userId: string },
): Promise<{ readonly cteProfileId: string; readonly nfseProfileId: string }> {
  const { companyId, userId } = input
  const freightRuleId = crypto.randomUUID()
  const nfseProfileId = crypto.randomUUID()
  await db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete T013',
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
  await db.insert(nfseEmissionProfiles).values({
    chargeComponentLabel: 'Frete',
    cnaeCode: '4930202',
    companyId,
    createdByUserId: userId,
    descriptionTemplate: 'Transporte {{periodo}}',
    freightRuleId,
    id: nfseProfileId,
    municipalityIbgeCode: '3543402',
    municipalityName: 'Ribeirao Preto',
    name: 'NFS-e T013',
    serviceListItem: '1602',
    status: 'active',
    taker: '3',
  })
  const cteProfileId = await seedEmissionProfile(db, {
    companyId,
    freightRuleId,
    matcher: { matchRole: 'sender', taxId: EMITTER_TAX_ID.slice(0, 8) },
    name: 'Perfil CT-e T013',
    nfseEmissionProfileId: null,
    userId,
  })
  await seedEmissionProfile(db, {
    companyId,
    freightRuleId,
    matcher: { matchRole: 'recipient', taxId: RECIPIENT_NFSE_TAX_ID },
    name: 'Perfil NFS-e T013',
    nfseEmissionProfileId: nfseProfileId,
    userId,
  })
  await seedFiscalProfileAndCredential(db, companyId)
  return { cteProfileId, nfseProfileId }
}

async function seedEmissionProfile(
  db: Database,
  input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly matcher: { readonly matchRole: 'recipient' | 'sender'; readonly taxId: string }
    readonly name: string
    readonly nfseEmissionProfileId: string | null
    readonly userId: string
  },
): Promise<string> {
  const profileId = crypto.randomUUID()
  await db.insert(cteEmissionProfiles).values({
    cfopInternal: '5353',
    cfopInterstate: '6353',
    chargeComponentLabel: 'FRETE PESO',
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightRuleId: input.freightRuleId,
    groupingMode: 'per_invoice',
    icmsCst: '00',
    icmsRate: '0.120000',
    id: profileId,
    matchMode: 'sender_tax_id',
    name: input.name,
    nfseEmissionProfileId: input.nfseEmissionProfileId,
    operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    outputDocument: input.nfseEmissionProfileId === null ? 'cte' : 'nfse',
    predominantProductMode: 'highest_value',
    receiverIeIndicator: '1',
    status: 'active',
    taker: '0',
  })
  await db.insert(cteEmissionProfileMatchers).values({
    companyId: input.companyId,
    matchRole: input.matcher.matchRole,
    profileId,
    taxId: input.matcher.taxId,
  })
  return profileId
}

/** O CNPJ da transportadora é único na instalação: cada cenário semeia o seu. */
async function seedFiscalProfileAndCredential(db: Database, companyId: string): Promise<void> {
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
    legalName: 'Transportadora T013 Ltda',
    municipalRegistration: '123456',
    number: '100',
    phone: '1630000000',
    postalCode: '14000000',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '110000000000',
    street: 'Rua da Transportadora',
    taxRegime: '1',
    tradeName: 'Transportadora T013',
  })
  // Sem sequência de CT-e o `issue` recusa com CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING, antes de reservar.
  await db.insert(fiscalSequences).values({
    companyId,
    environment: 'homologation',
    model: 'cte',
    nextNumber: 1n,
    series: 1n,
  })
  await db.insert(nfseProviderCredentials).values({
    callbackTokenSha256: crypto.randomUUID().replaceAll('-', '').repeat(2),
    companyId,
    fiscalEnvironment: 'homologation',
    municipalRegistration: '123456',
    secretEnvelope: {},
    taxId: carrierTaxId,
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
  const recipientTaxId = NFSE_NUMBERS.includes(input.number)
    ? RECIPIENT_NFSE_TAX_ID
    : RECIPIENT_CTE_TAX_ID

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
      legalName: 'Emitente T013 Ltda',
      role: 'emitter',
      stateRegistration: '110000000110',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: input.companyId,
      documentId,
      id: recipientId,
      legalName: 'Destinatario T013 Ltda',
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
  // O payload do CT-e resolve o produto predominante pelos itens da nota: sem item, o `issue` recusa.
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
