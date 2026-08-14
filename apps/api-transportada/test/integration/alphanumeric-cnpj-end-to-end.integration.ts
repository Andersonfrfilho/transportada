/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createBillingUseCase } from '../../src/billing/application/billing.use-case'
import { DrizzleBillingRepository } from '../../src/billing/infrastructure/drizzle-billing.repository'
import { createIdempotencyFingerprintService } from '../../src/companies/application/idempotency-fingerprint.service'
import { assembleCteIssuancePayload } from '../../src/cte-issuance/application/cte-issuance-payload.service'
import { buildDacteLayout } from '../../src/cte-issuance/domain/dacte-layout.policy'
import { findCteIssuancePayloadSource } from '../../src/cte-issuance/infrastructure/cte-issuance-payload.query'
import { parseCteXmlForDacte } from '../../src/cte-issuance/infrastructure/cte-xml.mapper'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  companyFiscalProfiles,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
  cteEmissionProfiles,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuancePayloads,
  fiscalSequenceReservations,
  fiscalSequences,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { buildSyntheticCteXml } from '../fixtures/cte-xml.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const HMAC_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 17)
const NOW = '2026-08-14T12:00:00.000Z'

/** O CNPJ alfanumérico publicado pela IN RFB 2229/2024 — `12.ABC.345/01DE-35` sem máscara. */
const CLIENT_DOCUMENT = '12ABC34501DE35'
const CLIENT_DOCUMENT_MASKED = '12.ABC.345/01DE-35'
const CARRIER_DOCUMENT = '00000000000191'
const RECIPIENT_DOCUMENT = '00000000000272'

/**
 * Chave sintética de NF-e com o CNPJ alfanumérico nas posições 7 a 20: cUF+AAMM, o documento do
 * emitente, e daí em diante só dígitos. Nunca uma chave fiscal real de cliente.
 */
const NFE_ACCESS_KEY = `352608${CLIENT_DOCUMENT}550010000000181000000018`
const CTE_ACCESS_KEY = `352608${CARRIER_DOCUMENT}570010000000011000000011`

const FREIGHT_AMOUNT = '350.0000'
const INVOICE_AMOUNT = '10000.0000'

describe('alphanumeric cnpj end to end', () => {
  testWithPostgres(
    'carries the alphanumeric document from the imported invoice to the issued bill',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedAlphanumericGraph(database)

        // 1. Importação e lote: o documento alfanumérico volta do banco sem ser reescrito.
        const source = await findCteIssuancePayloadSource(database.db, {
          batchId: seed.batchId,
          batchItemId: seed.batchItemId,
          companyId: seed.companyId,
        })

        expect(source).not.toBeNull()
        if (source === null) throw new Error('EXPECTED_PAYLOAD_SOURCE')
        expect(source.emitter.cnpj).toBe(CARRIER_DOCUMENT)
        expect(source.invoices).toHaveLength(1)
        expect(source.invoices[0]?.sender.taxId).toBe(CLIENT_DOCUMENT)
        expect(source.invoices[0]?.accessKey).toBe(NFE_ACCESS_KEY)

        // 2. Payload do CT-e: o remetente sai como CNPJ, e não como CPF por sobrar onze dígitos.
        const record = assembleCteIssuancePayload({
          attempt: {
            attemptId: seed.attemptId,
            batchId: seed.batchId,
            batchItemId: seed.batchItemId,
            companyId: seed.companyId,
            fiscalEnvironment: 'homologation',
            fiscalNumber: '1',
            fiscalSeries: '1',
          },
          issuedAt: NOW,
          source,
        })

        expect(record.payload.remetente).toMatchObject({ cnpj: CLIENT_DOCUMENT })
        expect(record.payload.remetente).not.toHaveProperty('cpf')
        expect(record.payload.destinatario).toMatchObject({ cnpj: RECIPIENT_DOCUMENT })
        const [documento] = record.payload.documentos
        if (documento === undefined || documento.tipo !== 'nfe') {
          throw new Error('EXPECTED_NFE_DOCUMENT')
        }
        expect(documento.chave).toBe(NFE_ACCESS_KEY)
        // O tomador é o remetente (`taker: '0'`) — é ele que a fatura vai cobrar.
        expect(record.takerTaxId).toBe(CLIENT_DOCUMENT)
        expect(record.providerConfig.cnpj).toBe(CARRIER_DOCUMENT)

        await database.db.insert(cteIssuancePayloads).values({
          attemptId: record.attemptId,
          batchId: record.batchId,
          batchItemId: record.batchItemId,
          companyId: record.companyId,
          payload: record.payload,
          payloadSha256: record.payloadSha256,
          providerConfig: record.providerConfig,
          takerLegalName: record.takerLegalName,
          takerTaxId: record.takerTaxId,
        })

        // 3. DACTE: o XML autorizado devolve o documento inteiro, e a impressão o pontua.
        const layout = buildDacteLayout(
          parseCteXmlForDacte(buildSyntheticCteXml({ parties: alphanumericPartiesXml() })),
        )
        const printed = layout.sections.flatMap((section) =>
          section.rows.flatMap((row) => row.fields.map((field) => field.value)),
        )

        expect(printed).toContain(CLIENT_DOCUMENT_MASKED)

        // 4. Fatura: a elegibilidade, a prévia e a emissão agrupam pelo mesmo documento.
        const useCase = createBillingUseCase({
          clock: { now: () => NOW },
          fingerprintService: createIdempotencyFingerprintService({ key: HMAC_KEY }),
          unitOfWork: new DrizzleBillingRepository(database.db),
        })
        const context = { companyId: seed.companyId, userId: seed.userId }
        const eligible = (
          await useCase.listEligible({ context, cursor: null, filters: {}, limit: 20 })
        ).items

        expect(eligible).toHaveLength(1)
        expect(eligible[0]?.['customerDocument']).toBe(CLIENT_DOCUMENT)

        const cteDocumentId = requiredResultString(eligible[0], 'id')
        const preview = await useCase.preview({ context, cteDocumentIds: [cteDocumentId] })

        expect(preview.blocked).toEqual([])
        expect(preview.groups).toHaveLength(1)
        expect(preview.groups[0]?.customerDocument).toBe(CLIENT_DOCUMENT)

        const created = await useCase.create({
          context,
          correlationId: 'correlation-invoice-alphanumeric',
          cteDocumentIds: [cteDocumentId],
          dueDate: '2026-09-14',
          idempotencyKey: 'invoice-alphanumeric',
        })
        const invoice = await useCase.get({
          context,
          invoiceId: requiredResultString(created, 'id'),
        })

        expect(invoice['customerDocument']).toBe(CLIENT_DOCUMENT)
        expect(invoice['totalAmount']).toBe('350.00')
        // A linha da fatura guarda a chave com letras: é o CHECK do banco que a aceita.
        expect(JSON.stringify(invoice)).toContain(CTE_ACCESS_KEY)

        // A filtragem por documento continua sendo comparação com o valor canônico gravado.
        expect(
          (
            await useCase.listEligible({
              context,
              cursor: null,
              filters: { customerDocument: CLIENT_DOCUMENT.toLowerCase() },
              limit: 20,
            })
          ).items,
        ).toEqual([])
      })
    },
    30_000,
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type SeededGraph = {
  readonly attemptId: string
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly userId: string
}

function alphanumericPartiesXml(): string {
  return `
      <rem>
        <CNPJ>${CLIENT_DOCUMENT}</CNPJ>
        <IE>110000000110</IE>
        <xNome>Cliente Alfanumerico Ltda</xNome>
        <enderReme>
          <xLgr>Rua das Amostras</xLgr>
          <nro>100</nro>
          <xBairro>Centro</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <CEP>01000000</CEP>
          <UF>SP</UF>
        </enderReme>
      </rem>
      <dest>
        <CNPJ>${RECIPIENT_DOCUMENT}</CNPJ>
        <IE>ISENTO</IE>
        <xNome>Destinatario Sintetico Ltda</xNome>
        <enderDest>
          <xLgr>Avenida dos Testes</xLgr>
          <nro>250</nro>
          <xBairro>Industrial</xBairro>
          <cMun>3304557</cMun>
          <xMun>Rio de Janeiro</xMun>
          <CEP>20000000</CEP>
          <UF>RJ</UF>
        </enderDest>
      </dest>`
}

async function seedAlphanumericGraph(database: TestDatabase): Promise<SeededGraph> {
  const ids = {
    attempt: crypto.randomUUID(),
    batch: crypto.randomUUID(),
    batchItem: crypto.randomUUID(),
    batchItemDocument: crypto.randomUUID(),
    company: crypto.randomUUID(),
    cteDocument: crypto.randomUUID(),
    cteXmlObject: crypto.randomUUID(),
    emissionProfile: crypto.randomUUID(),
    fiscalReservation: crypto.randomUUID(),
    fiscalSequence: crypto.randomUUID(),
    freightCalculation: crypto.randomUUID(),
    freightRule: crypto.randomUUID(),
    freightRuleVersion: crypto.randomUUID(),
    import: crypto.randomUUID(),
    membership: crypto.randomUUID(),
    nfeDocument: crypto.randomUUID(),
    nfeXmlObject: crypto.randomUUID(),
    recipient: crypto.randomUUID(),
    sender: crypto.randomUUID(),
    user: crypto.randomUUID(),
  }
  const sha = 'a'.repeat(64)

  await database.db.insert(identityUsers).values({ id: ids.user, status: 'active' })
  await database.db.insert(companies).values({ id: ids.company, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: ids.company,
    id: ids.membership,
    status: 'active',
    userId: ids.user,
  })
  await database.db.insert(companyFiscalProfiles).values({
    city: 'Sao Paulo',
    cityIbgeCode: '3550308',
    cnpj: CARRIER_DOCUMENT,
    companyId: ids.company,
    complement: '',
    district: 'Distrito',
    email: 'fiscal@example.test',
    legalName: 'Transportadora Sintetica Ltda',
    municipalRegistration: '',
    number: '1500',
    phone: '1140000000',
    postalCode: '04000000',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '110000000000',
    street: 'Rodovia dos Contratos',
    taxRegime: '1',
    tradeName: 'Transportadora Sintetica',
  })
  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId: ids.company,
      id: ids.nfeXmlObject,
      mimeType: 'application/xml',
      objectKey: 'nfe/alphanumeric.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId: ids.company,
      id: ids.cteXmlObject,
      mimeType: 'application/xml',
      objectKey: 'cte/alphanumeric.xml',
      provider: 's3',
      purpose: 'nfe_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId: ids.company,
    correlationId: 'correlation-import-alphanumeric',
    id: ids.import,
    idempotencyKey: 'import-alphanumeric',
    requestFingerprint: 'fingerprint-import-alphanumeric',
    requestedByUserId: ids.user,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: NFE_ACCESS_KEY,
    authorizationProtocol: 'protocol-nfe-alphanumeric',
    companyId: ids.company,
    createdByUserId: ids.user,
    freightValue: '0.0000',
    id: ids.nfeDocument,
    importId: ids.import,
    issuedAt: new Date('2026-08-13T12:00:00.000Z'),
    model: '55',
    number: '18',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: INVOICE_AMOUNT,
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: INVOICE_AMOUNT,
    xmlObjectId: ids.nfeXmlObject,
    xmlSha256: sha,
  })
  await database.db.insert(nfeParticipants).values([
    {
      companyId: ids.company,
      documentId: ids.nfeDocument,
      id: ids.sender,
      legalName: 'Cliente Alfanumerico Ltda',
      role: 'emitter',
      stateRegistration: '110000000110',
      taxId: CLIENT_DOCUMENT,
    },
    {
      companyId: ids.company,
      documentId: ids.nfeDocument,
      id: ids.recipient,
      legalName: 'Destinatario Sintetico Ltda',
      role: 'recipient',
      stateRegistration: 'ISENTO',
      taxId: RECIPIENT_DOCUMENT,
    },
  ])
  await database.db.insert(nfeAddresses).values([
    {
      city: 'Sao Paulo',
      cityCode: '3550308',
      companyId: ids.company,
      district: 'Centro',
      number: '100',
      participantId: ids.sender,
      postalCode: '01000000',
      state: 'SP',
      street: 'Rua das Amostras',
    },
    {
      city: 'Rio de Janeiro',
      cityCode: '3304557',
      companyId: ids.company,
      district: 'Industrial',
      number: '250',
      participantId: ids.recipient,
      postalCode: '20000000',
      state: 'RJ',
      street: 'Avenida dos Testes',
    },
  ])
  await database.db.insert(nfeProducts).values({
    cfop: '5102',
    code: 'PROD-1',
    commercialUnit: 'UN',
    companyId: ids.company,
    description: 'PRODUTO SINTETICO',
    documentId: ids.nfeDocument,
    ncm: '84713012',
    ordinal: 1n,
    quantity: '40.0000',
    totalValue: INVOICE_AMOUNT,
    unitValue: '250.0000',
  })
  await database.db.insert(nfeVolumes).values({
    companyId: ids.company,
    documentId: ids.nfeDocument,
    grossWeight: '1250.0000',
    netWeight: '1200.0000',
    ordinal: 1n,
    quantity: '40.0000',
  })
  await database.db.insert(freightRules).values({
    companyId: ids.company,
    createdByUserId: ids.user,
    currentVersion: 1n,
    id: ids.freightRule,
    name: 'Frete alfanumerico',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: ids.company,
    createdByUserId: ids.user,
    filters: {},
    freightRuleId: ids.freightRule,
    id: ids.freightRuleVersion,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: INVOICE_AMOUNT,
    calculatedAmount: FREIGHT_AMOUNT,
    calculationDetails: {},
    companyId: ids.company,
    correlationId: 'correlation-freight-alphanumeric',
    createdByUserId: ids.user,
    freightRuleId: ids.freightRule,
    freightRuleVersionId: ids.freightRuleVersion,
    id: ids.freightCalculation,
    idempotencyKey: 'freight-alphanumeric',
    nfeDocumentId: ids.nfeDocument,
    percentage: '0.035000',
    requestFingerprint: 'fingerprint-freight-alphanumeric',
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: FREIGHT_AMOUNT,
  })
  await database.db.insert(cteEmissionProfiles).values({
    cfopInternal: '5353',
    cfopInterstate: '6353',
    chargeComponentLabel: 'FRETE PESO',
    companyId: ids.company,
    createdByUserId: ids.user,
    freightRuleId: ids.freightRule,
    groupingMode: 'per_invoice',
    icmsCst: '00',
    icmsRate: '0.120000',
    id: ids.emissionProfile,
    matchMode: 'sender_tax_id',
    name: 'Perfil alfanumerico',
    operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    predominantProductMode: 'highest_value',
    receiverIeIndicator: '1',
    status: 'active',
    taker: '0',
  })
  await database.db.insert(cteBatches).values({
    companyId: ids.company,
    correlationId: 'correlation-batch-alphanumeric',
    id: ids.batch,
    idempotencyFingerprint: 'fingerprint-batch-alphanumeric',
    idempotencyKey: 'batch-alphanumeric',
    name: 'Lote alfanumerico',
    operatorUserId: ids.user,
    status: 'done',
    version: 1n,
  })
  await database.db.insert(cteBatchItems).values({
    batchId: ids.batch,
    calculationSnapshot: {
      fiscalAmount: FREIGHT_AMOUNT,
      fiscalComponents: [{ amount: FREIGHT_AMOUNT, label: 'FRETE PESO' }],
      profile: { id: ids.emissionProfile },
      totalAmount: FREIGHT_AMOUNT,
    },
    companyId: ids.company,
    freightCalculationId: ids.freightCalculation,
    id: ids.batchItem,
    nfeDocumentId: ids.nfeDocument,
    position: 1n,
  })
  await database.db.insert(cteBatchItemDocuments).values({
    batchId: ids.batch,
    companyId: ids.company,
    id: ids.batchItemDocument,
    itemId: ids.batchItem,
    nfeDocumentId: ids.nfeDocument,
    position: 1n,
  })
  await database.db.insert(fiscalSequences).values({
    companyId: ids.company,
    environment: 'homologation',
    id: ids.fiscalSequence,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId: ids.company,
    fiscalSequenceId: ids.fiscalSequence,
    id: ids.fiscalReservation,
    number: 1n,
    reservationKey: 'reservation-alphanumeric',
  })
  await database.db.insert(cteIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    batchId: ids.batch,
    batchItemId: ids.batchItem,
    companyId: ids.company,
    correlationId: 'correlation-cte-alphanumeric',
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    id: ids.attempt,
    idempotencyFingerprint: 'fingerprint-cte-alphanumeric',
    idempotencyKey: 'cte-alphanumeric',
    requestFingerprint: 'request-cte-alphanumeric',
    reservationId: ids.fiscalReservation,
    status: 'authorized',
  })
  await database.db.insert(cteFiscalDocuments).values({
    accessKey: CTE_ACCESS_KEY,
    attemptId: ids.attempt,
    authorizationProtocol: 'protocol-cte-alphanumeric',
    authorizedAt: new Date('2026-08-13T20:00:00.000Z'),
    batchItemId: ids.batchItem,
    companyId: ids.company,
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    id: ids.cteDocument,
    status: 'authorized',
    xmlObjectId: ids.cteXmlObject,
    xmlSha256: sha,
  })

  return {
    attemptId: ids.attempt,
    batchId: ids.batch,
    batchItemId: ids.batchItem,
    companyId: ids.company,
    userId: ids.user,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t024_${crypto.randomUUID().replaceAll('-', '')}`
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

function requiredResultString(record: unknown, field: string): string {
  if (typeof record !== 'object' || record === null) throw new Error('EXPECTED_RECORD')
  const value = Reflect.get(record, field)
  if (typeof value !== 'string' || value.length === 0) throw new Error('EXPECTED_STRING')
  return value
}
