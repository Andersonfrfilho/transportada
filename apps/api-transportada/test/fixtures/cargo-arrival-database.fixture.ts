/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: o banco da chegada para a integração — duas empresas, o contratante com perfil
 * ligado, outro sem perfil, e notas com emitente, destinatário e cidade. Dados inventados.
 */
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractorReceivingProfiles,
  contractors,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  tripDocuments,
  trips,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from './disposable-database.fixture.js'
import { COMPANY_CONTEXT } from './freight-region-http.fixture.js'

export type TestDatabase = ReturnType<typeof createDatabaseProvider>

export const ISSUER_TAX_ID = '30290856000160'
export const OTHER_ISSUER_TAX_ID = '11222333000181'
export const SAO_CARLOS = '3548906'
export const ARARAQUARA = '3503208'

export type CargoTenants = {
  readonly contractorId: string
  readonly foreignCompanyId: string
  readonly foreignContractorId: string
  readonly foreignMembershipId: string
  readonly otherContractorId: string
}

export async function seedCargoTenants(database: TestDatabase): Promise<CargoTenants> {
  const companyId = COMPANY_CONTEXT.companyId
  const foreignCompanyId = crypto.randomUUID()
  const foreignMembershipId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const otherContractorId = crypto.randomUUID()
  const foreignContractorId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: companyId, status: 'active' },
    { id: foreignCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: COMPANY_CONTEXT.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values([
    {
      companyId,
      id: COMPANY_CONTEXT.membershipId,
      status: 'active',
      userId: COMPANY_CONTEXT.userId,
    },
    {
      companyId: foreignCompanyId,
      id: foreignMembershipId,
      status: 'active',
      userId: COMPANY_CONTEXT.userId,
    },
  ])
  await database.db.insert(contractors).values([
    { companyId, id: contractorId, taxId: ISSUER_TAX_ID },
    { companyId, id: otherContractorId, taxId: OTHER_ISSUER_TAX_ID },
    { companyId: foreignCompanyId, id: foreignContractorId, taxId: ISSUER_TAX_ID },
  ])
  await database.db.insert(contractorReceivingProfiles).values({
    companyId,
    contractorId: contractorId,
    deliveryDeadlineBusinessDays: 3,
    isEnabled: true,
    separationWindowHours: 24,
  })
  return {
    contractorId: contractorId,
    foreignCompanyId,
    foreignContractorId: foreignContractorId,
    foreignMembershipId,
    otherContractorId: otherContractorId,
  }
}

export type SeedDocumentParams = {
  readonly cityCode?: string
  readonly companyId?: string
  readonly emitterTaxId?: string
  readonly issuedAt?: Date
  readonly number: string
}

/** Uma NF-e autorizada com emitente, destinatário e o endereço dele. */
export async function seedIssuedDocument(
  database: TestDatabase,
  params: SeedDocumentParams,
): Promise<string> {
  const companyId = params.companyId ?? COMPANY_CONTEXT.companyId
  const [documentId, importId, xmlObjectId, recipientId] = [1, 2, 3, 4].map(() =>
    crypto.randomUUID(),
  ) as [string, string, string, string]
  const suffix = documentId.replaceAll('-', '')
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/cargo-arrival-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: suffix.padEnd(64, '0'),
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `cargo-arrival-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: COMPANY_CONTEXT.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId,
    createdByUserId: COMPANY_CONTEXT.userId,
    id: documentId,
    importId,
    issuedAt: params.issuedAt ?? new Date('2026-10-02T22:00:00.000Z'),
    model: '55',
    number: params.number,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: suffix.padEnd(64, '0'),
  })
  await database.db.insert(nfeParticipants).values([
    { companyId, documentId, role: 'emitter', taxId: params.emitterTaxId ?? ISSUER_TAX_ID },
    { companyId, documentId, id: recipientId, legalName: 'Destinatário Teste', role: 'recipient' },
  ])
  await database.db.insert(nfeAddresses).values({
    city: 'Cidade Teste',
    cityCode: params.cityCode ?? SAO_CARLOS,
    companyId,
    participantId: recipientId,
    state: 'SP',
  })
  return documentId
}

/** A nota numa viagem viva — o vínculo é do fluxo de viagem, aqui só se semeia. */
export async function seedLiveTrip(database: TestDatabase, nfeDocumentId: string): Promise<void> {
  const tripId = crypto.randomUUID()
  await database.db.insert(trips).values({ companyId: COMPANY_CONTEXT.companyId, id: tripId })
  await database.db
    .insert(tripDocuments)
    .values({ companyId: COMPANY_CONTEXT.companyId, nfeDocumentId, tripId })
}

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL

export const hasTestDatabase = databaseUrl !== undefined

export async function withCargoDatabase(
  operation: (database: TestDatabase, tenants: CargoTenants) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_cargo_arrival',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 10, max: 4, queryTimeoutMs: 20_000 },
        url: connectionString,
      }),
    operation: async (database) => operation(database, await seedCargoTenants(database)),
  })
}
