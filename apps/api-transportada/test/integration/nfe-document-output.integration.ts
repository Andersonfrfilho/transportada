/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  freightRules,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeVolumes,
  nfseEmissionProfiles,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const RECIPIENT_TAX_ID = '00000000000272'
const SHA = 'a'.repeat(64)

/**
 * Um emitente por cenário, cada um casado por um perfil diferente — é o CNPJ do emitente que decide
 * qual perfil rege a nota, e portanto qual documento ela gera.
 */
const SCENARIOS = {
  cte: { number: '1', senderTaxId: '11111111000191' },
  nfse: { number: '2', senderTaxId: '22222222000191' },
  nfseInactive: { number: '3', senderTaxId: '33333333000191' },
  unmatched: { number: '4', senderTaxId: '44444444000191' },
} as const

type ScenarioKey = keyof typeof SCENARIOS

const NOT_STORAGE = {} as NfeStorageGateway

/**
 * A paridade da D3 (spec 144): a classificação que a listagem publica por página e a que a porta do
 * bot devolve por id são o mesmo resultado sobre as mesmas notas, em banco de verdade — o join do
 * perfil NFS-e incluído, que nenhum contrato em memória exercita.
 */
describe('nfe document output classification integration', () => {
  testWithPostgres(
    'a listagem e a porta do bot classificam igual, e o status do perfil NFS-e vem do join',
    async () => {
      await withDisposableDatabase(async (database) => {
        const primary = await seedCompany(database)
        const other = await seedCompany(database)
        const repository = new DrizzleNfeDocumentRepository(database.db, NOT_STORAGE)
        const context = {
          companyId: primary.companyId,
          kind: 'company' as const,
          membershipId: crypto.randomUUID(),
          permissions: new Set<never>(),
          roles: [],
          userId: primary.userId,
        }

        const page = await repository.list({ accessKey: null, context, cursor: null, limit: 50 })
        const listed = new Map(page.items.map((item) => [item.id, item]))
        const documentIds = Object.values(primary.documentIdByScenario)
        const classified = await repository.classifyDocumentOutputs({
          companyId: primary.companyId,
          documentIds,
        })

        const byScenario = (key: ScenarioKey) => listed.get(primary.documentIdByScenario[key])
        expect(byScenario('cte')?.documentOutput).toEqual({ output: 'cte' })
        expect(byScenario('cte')?.cteBlockReason).toBeNull()
        expect(byScenario('nfse')?.documentOutput).toEqual({
          nfseProfileId: primary.activeNfseProfileId,
          output: 'nfse',
        })
        // A nota de NFS-e é recusada no CT-e pela listagem, senão o botão a aceitaria.
        expect(byScenario('nfse')?.cteBlockReason).toBe('CTE_BATCH_DOCUMENT_OUTPUT_NFSE')
        expect(byScenario('nfseInactive')?.documentOutput).toEqual({
          output: 'blocked',
          reason: 'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE',
        })
        expect(byScenario('unmatched')?.documentOutput).toEqual({
          output: 'no_profile',
          reason: 'unmatched',
        })

        // Paridade: os dois caminhos, as mesmas notas, o mesmo resultado.
        expect(classified.size).toBe(documentIds.length)
        for (const documentId of documentIds) {
          expect({ documentId, output: classified.get(documentId) }).toEqual({
            documentId,
            output: listed.get(documentId)?.documentOutput,
          })
        }

        // Isolamento: nota de outra empresa no pedido do bot fica fora do mapa, sem erro.
        const crossed = await repository.classifyDocumentOutputs({
          companyId: primary.companyId,
          documentIds: [...documentIds, other.documentIdByScenario.cte],
        })
        expect(crossed.has(other.documentIdByScenario.cte)).toBe(false)
        expect(crossed.size).toBe(documentIds.length)
      })
    },
    60_000,
  )
})

type SeededCompany = {
  readonly activeNfseProfileId: string
  readonly companyId: string
  readonly documentIdByScenario: Record<ScenarioKey, string>
  readonly userId: string
}

async function seedCompany(database: TestDatabase): Promise<SeededCompany> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const activeNfseProfileId = crypto.randomUUID()
  const inactiveNfseProfileId = crypto.randomUUID()

  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(storedObjects).values({
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
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${companyId}`,
    id: importId,
    idempotencyKey: `import-${companyId}`,
    requestFingerprint: `fingerprint-${companyId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete de teste',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(nfseEmissionProfiles).values(
    [
      { id: activeNfseProfileId, name: 'NFS-e ativa', status: 'active' as const },
      { id: inactiveNfseProfileId, name: 'NFS-e inativa', status: 'inactive' as const },
    ].map((profile) => ({
      ...profile,
      chargeComponentLabel: 'Frete',
      cnaeCode: '4930202',
      companyId,
      createdByUserId: userId,
      descriptionTemplate: 'Transporte {{periodo}}',
      freightRuleId,
      municipalityIbgeCode: '3543402',
      municipalityName: 'Ribeirao Preto',
      serviceListItem: '1602',
      taker: '0' as const,
    })),
  )
  await seedEmissionProfile(database, {
    companyId,
    freightRuleId,
    nfseEmissionProfileId: null,
    senderTaxId: SCENARIOS.cte.senderTaxId,
    userId,
  })
  await seedEmissionProfile(database, {
    companyId,
    freightRuleId,
    nfseEmissionProfileId: activeNfseProfileId,
    senderTaxId: SCENARIOS.nfse.senderTaxId,
    userId,
  })
  await seedEmissionProfile(database, {
    companyId,
    freightRuleId,
    nfseEmissionProfileId: inactiveNfseProfileId,
    senderTaxId: SCENARIOS.nfseInactive.senderTaxId,
    userId,
  })

  const documentIdByScenario = {} as Record<ScenarioKey, string>
  for (const [key, scenario] of Object.entries(SCENARIOS) as [
    ScenarioKey,
    (typeof SCENARIOS)[ScenarioKey],
  ][]) {
    documentIdByScenario[key] = await seedDocument(database, {
      companyId,
      importId,
      number: scenario.number,
      senderTaxId: scenario.senderTaxId,
      userId,
      xmlObjectId,
    })
  }

  return { activeNfseProfileId, companyId, documentIdByScenario, userId }
}

async function seedEmissionProfile(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nfseEmissionProfileId: string | null
    readonly senderTaxId: string
    readonly userId: string
  },
): Promise<void> {
  const profileId = crypto.randomUUID()
  await database.db.insert(cteEmissionProfiles).values({
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
    name: `Perfil ${input.senderTaxId}`,
    nfseEmissionProfileId: input.nfseEmissionProfileId,
    operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    outputDocument: input.nfseEmissionProfileId === null ? 'cte' : 'nfse',
    predominantProductMode: 'highest_value',
    receiverIeIndicator: '1',
    status: 'active',
    taker: '0',
  })
  await database.db.insert(cteEmissionProfileMatchers).values({
    companyId: input.companyId,
    matchRole: 'sender',
    profileId,
    taxId: input.senderTaxId,
  })
}

async function seedDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly importId: string
    readonly number: string
    readonly senderTaxId: string
    readonly userId: string
    readonly xmlObjectId: string
  },
): Promise<string> {
  const documentId = crypto.randomUUID()
  const senderId = crypto.randomUUID()
  const recipientId = crypto.randomUUID()
  const accessKey = `352608${input.senderTaxId}5500100000000${input.number}1000000018`

  await database.db.insert(nfeDocuments).values({
    accessKey,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId: input.importId,
    issuedAt: new Date('2026-08-13T12:00:00.000Z'),
    model: '55',
    number: input.number,
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
  await database.db.insert(nfeParticipants).values([
    {
      companyId: input.companyId,
      documentId,
      id: senderId,
      legalName: 'Emitente Sintetico Ltda',
      role: 'emitter',
      stateRegistration: '110000000110',
      taxId: input.senderTaxId,
    },
    {
      companyId: input.companyId,
      documentId,
      id: recipientId,
      legalName: 'Destinatario Sintetico Ltda',
      role: 'recipient',
      stateRegistration: 'ISENTO',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
  await database.db.insert(nfeAddresses).values([
    {
      city: 'Sao Paulo',
      cityCode: '3550308',
      companyId: input.companyId,
      district: 'Centro',
      number: '100',
      participantId: senderId,
      postalCode: '01000000',
      state: 'SP',
      street: 'Rua das Amostras',
    },
    {
      city: 'Rio de Janeiro',
      cityCode: '3304557',
      companyId: input.companyId,
      district: 'Industrial',
      number: '250',
      participantId: recipientId,
      postalCode: '20000000',
      state: 'RJ',
      street: 'Avenida dos Testes',
    },
  ])
  await database.db.insert(nfeVolumes).values({
    companyId: input.companyId,
    documentId,
    grossWeight: '120.0000',
    netWeight: '100.0000',
    ordinal: 1n,
    quantity: '4.0000',
  })
  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t010_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
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
