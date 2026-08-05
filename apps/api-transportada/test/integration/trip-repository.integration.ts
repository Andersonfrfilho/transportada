/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  cteBatches,
  cteBatchItems,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('trip repository integration', () => {
  testWithPostgres(
    'persists trips, enforces the live-document uniqueness at the database, and isolates tenants',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        const userId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const driverOneId = crypto.randomUUID()
        const driverTwoId = crypto.randomUUID()

        await database.db.insert(companies).values([
          { id: companyId, status: 'active' },
          { id: otherCompanyId, status: 'active' },
        ])
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await database.db.insert(userCompanyMemberships).values({
          companyId,
          id: crypto.randomUUID(),
          status: 'active',
          userId,
        })
        await database.db.insert(fleetVehicles).values({
          companyId,
          id: vehicleId,
          plate: 'ABC1D23',
          role: 'traction',
          state: 'SP',
          wheelType: '03',
        })
        await database.db.insert(fleetDrivers).values([
          { companyId, id: driverOneId, name: 'Motorista Um', taxId: '11111111111' },
          { companyId, id: driverTwoId, name: 'Motorista Dois', taxId: '22222222222' },
        ])
        const nfeDocumentId = await seedNfeDocument(database, { companyId, suffix: '1', userId })
        const freightCalculationId = await seedFreightCalculation(database, {
          companyId,
          nfeDocumentId,
          userId,
        })

        const repository = new DrizzleTripRepository(database.db)

        const created = await repository.create({
          companyId,
          crew: [
            {
              driverId: driverOneId,
              driverName: 'Motorista Um',
              driverTaxId: '11111111111',
              position: 1,
            },
            {
              driverId: driverTwoId,
              driverName: 'Motorista Dois',
              driverTaxId: '22222222222',
              position: 2,
            },
          ],
          vehicleId,
        })
        expect(created).toMatchObject({
          companyId,
          documents: [],
          status: 'open',
          vehicleId,
        })
        expect(created.drivers).toEqual([
          {
            driverId: driverOneId,
            driverName: 'Motorista Um',
            driverTaxId: '11111111111',
            position: 1,
          },
          {
            driverId: driverTwoId,
            driverName: 'Motorista Dois',
            driverTaxId: '22222222222',
            position: 2,
          },
        ])

        const secondTrip = await repository.create({ companyId, crew: [], vehicleId })

        expect(await repository.findById({ companyId, tripId: created.id })).toEqual(created)
        // Outro tenant nunca enxerga a viagem, mesmo sabendo o id.
        expect(
          await repository.findById({ companyId: otherCompanyId, tripId: created.id }),
        ).toBeNull()
        expect(await repository.findById({ companyId, tripId: crypto.randomUUID() })).toBeNull()

        expect(await repository.findVehicle({ companyId, vehicleId })).toEqual({
          id: vehicleId,
          role: 'traction',
          status: 'active',
        })
        expect(await repository.findVehicle({ companyId: otherCompanyId, vehicleId })).toBeNull()

        const drivers = await repository.listDrivers({
          companyId,
          driverIds: [driverOneId, driverTwoId],
        })
        expect(drivers).toHaveLength(2)
        expect(new Set(drivers.map((driver) => driver.id))).toEqual(
          new Set([driverOneId, driverTwoId]),
        )
        expect(await repository.listDrivers({ companyId, driverIds: [] })).toEqual([])
        // Tenant vizinho não enxerga os condutores, sem lançar — a busca só filtra.
        expect(
          await repository.listDrivers({
            companyId: otherCompanyId,
            driverIds: [driverOneId],
          }),
        ).toEqual([])

        const nfeLink = await repository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId,
          tripId: created.id,
        })
        expect(nfeLink).toMatchObject({
          deliveredAt: null,
          freightCalculationId: null,
          nfeDocumentId,
          releasedAt: null,
          tripId: created.id,
        })

        // A mesma nota já está viva em `created` — o índice condicional trava a segunda viagem.
        await expect(
          repository.linkDocument({
            companyId,
            freightCalculationId: null,
            nfeDocumentId,
            tripId: secondTrip.id,
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DOCUMENT_ALREADY_LINKED', status: 409 })

        const freightLink = await repository.linkDocument({
          companyId,
          freightCalculationId,
          nfeDocumentId: null,
          tripId: created.id,
        })
        // O mesmo desenho vale para o frete já calculado.
        await expect(
          repository.linkDocument({
            companyId,
            freightCalculationId,
            nfeDocumentId: null,
            tripId: secondTrip.id,
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DOCUMENT_ALREADY_LINKED', status: 409 })

        // fiscalStatus é derivado por join em tempo de leitura (T009b) — nunca persistido.
        const detailWithLiveDocuments = await repository.findById({ companyId, tripId: created.id })
        expect(
          detailWithLiveDocuments?.documents.find((candidate) => candidate.id === nfeLink.id),
        ).toMatchObject({ fiscalStatus: 'authorized' })
        expect(
          detailWithLiveDocuments?.documents.find((candidate) => candidate.id === freightLink.id),
        ).toMatchObject({ fiscalStatus: 'snapshotted' })

        // cteAuthorized (T011): nenhum CT-e ainda — nem o vínculo direto, nem o via frete.
        expect(
          detailWithLiveDocuments?.documents.find((candidate) => candidate.id === nfeLink.id),
        ).toMatchObject({ cteAuthorized: false })
        expect(
          detailWithLiveDocuments?.documents.find((candidate) => candidate.id === freightLink.id),
        ).toMatchObject({ cteAuthorized: false })

        // Um CT-e autorizado para `nfeDocumentId` vira `cteAuthorized: true` nos dois vínculos —
        // o direto (nfeLink) e o via cálculo de frete (freightLink), já que ambos resolvem à mesma nota.
        await seedCteFiscalDocument(database, {
          companyId,
          nfeDocumentId,
          status: 'authorized',
          suffix: '3',
          userId,
        })
        const detailWithAuthorizedCte = await repository.findById({
          companyId,
          tripId: created.id,
        })
        expect(
          detailWithAuthorizedCte?.documents.find((candidate) => candidate.id === nfeLink.id),
        ).toMatchObject({ cteAuthorized: true })
        expect(
          detailWithAuthorizedCte?.documents.find((candidate) => candidate.id === freightLink.id),
        ).toMatchObject({ cteAuthorized: true })

        // CT-e cancelado não conta como autorizado (só `status = 'authorized'` habilita o MDF-e).
        const cancelledCteNfeDocumentId = await seedNfeDocument(database, {
          companyId,
          suffix: '2',
          userId,
        })
        await seedCteFiscalDocument(database, {
          companyId,
          nfeDocumentId: cancelledCteNfeDocumentId,
          status: 'cancelled',
          suffix: '4',
          userId,
        })
        const cancelledCteLink = await repository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: cancelledCteNfeDocumentId,
          tripId: secondTrip.id,
        })
        const secondTripDetail = await repository.findById({ companyId, tripId: secondTrip.id })
        expect(
          secondTripDetail?.documents.find((candidate) => candidate.id === cancelledCteLink.id),
        ).toMatchObject({ cteAuthorized: false })

        expect(
          await repository.findDocumentById({
            companyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toEqual(nfeLink)
        expect(
          await repository.findDocumentById({
            companyId: otherCompanyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toBeNull()

        // Tenant vizinho não escreve na nota alheia, mesmo com os ids corretos em mãos.
        expect(
          await repository.deliverDocument({
            companyId: otherCompanyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toBeNull()
        expect(
          await repository.releaseDocument({
            companyId: otherCompanyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toBeNull()
        expect(
          await repository.findDocumentById({
            companyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toMatchObject({ deliveredAt: null, releasedAt: null })

        const delivered = await repository.deliverDocument({
          companyId,
          documentId: nfeLink.id,
          tripId: created.id,
        })
        expect(delivered?.deliveredAt).not.toBeNull()

        // Entregue trava: o release na camada de banco também recusa, espelhando o domínio.
        expect(
          await repository.releaseDocument({
            companyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toBeNull()

        const released = await repository.releaseDocument({
          companyId,
          documentId: freightLink.id,
          tripId: created.id,
        })
        expect(released?.releasedAt).not.toBeNull()

        // Liberado, o frete pode migrar para outra viagem — o índice só olha linhas ainda vivas.
        const migratedFreightLink = await repository.linkDocument({
          companyId,
          freightCalculationId,
          nfeDocumentId: null,
          tripId: secondTrip.id,
        })
        expect(migratedFreightLink.tripId).toBe(secondTrip.id)

        // spec 027 § Dúvidas: nota cancelada não bloqueia nem se desvincula sozinha — ela segue
        // vinculável, liberável e entregável como qualquer outra; o status só aparece na leitura.
        const cancelledNfeDocumentId = await seedNfeDocument(database, {
          companyId,
          status: 'cancelled',
          suffix: '5',
          userId,
        })
        const cancelledNfeLink = await repository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: cancelledNfeDocumentId,
          tripId: secondTrip.id,
        })
        const secondTripWithCancelledNfe = await repository.findById({
          companyId,
          tripId: secondTrip.id,
        })
        expect(
          secondTripWithCancelledNfe?.documents.find(
            (candidate) => candidate.id === cancelledNfeLink.id,
          ),
        ).toMatchObject({ fiscalStatus: 'cancelled' })
        const releasedCancelledNfe = await repository.releaseDocument({
          companyId,
          documentId: cancelledNfeLink.id,
          tripId: secondTrip.id,
        })
        expect(releasedCancelledNfe?.releasedAt).not.toBeNull()
        const relinkedCancelledNfe = await repository.linkDocument({
          companyId,
          freightCalculationId: null,
          nfeDocumentId: cancelledNfeDocumentId,
          tripId: secondTrip.id,
        })
        const deliveredCancelledNfe = await repository.deliverDocument({
          companyId,
          documentId: relinkedCancelledNfe.id,
          tripId: secondTrip.id,
        })
        expect(deliveredCancelledNfe?.deliveredAt).not.toBeNull()

        const closed = await repository.close({ companyId, tripId: created.id })
        expect(closed?.status).toBe('closed')
        // Viagem fechada: a escrita condicionada não acha linha nenhuma, e é o que fecha a corrida
        // entre a checagem do caso de uso e o update.
        expect(
          await repository.deliverDocument({
            companyId,
            documentId: nfeLink.id,
            tripId: created.id,
          }),
        ).toBeNull()
        expect(await repository.close({ companyId: otherCompanyId, tripId: created.id })).toBeNull()
        expect(await repository.close({ companyId, tripId: crypto.randomUUID() })).toBeNull()

        // `created` está closed; `secondTrip` segue open — cobre statusEq, vehicleIdEq, driverIdEq.
        const openPage = await repository.list({
          companyId,
          cursor: null,
          filters: { statusEq: 'open' },
          limit: 10,
        })
        expect(openPage.items.map((trip) => trip.id)).toEqual([secondTrip.id])
        expect(openPage.nextCursor).toBeNull()

        const vehiclePage = await repository.list({
          companyId,
          cursor: null,
          filters: { vehicleIdEq: vehicleId },
          limit: 10,
        })
        expect(new Set(vehiclePage.items.map((trip) => trip.id))).toEqual(
          new Set([created.id, secondTrip.id]),
        )

        const driverPage = await repository.list({
          companyId,
          cursor: null,
          filters: { driverIdEq: driverOneId },
          limit: 10,
        })
        // Só `created` tem tripulação — `secondTrip` nasceu com crew vazia.
        expect(driverPage.items.map((trip) => trip.id)).toEqual([created.id])

        // Paginação keyset: página de 1 devolve `nextCursor`, e reaplicar o cursor traz o resto.
        const firstPage = await repository.list({ companyId, cursor: null, limit: 1 })
        expect(firstPage.items).toHaveLength(1)
        expect(firstPage.nextCursor).not.toBeNull()
        const secondPage = await repository.list({
          companyId,
          cursor: firstPage.nextCursor,
          limit: 1,
        })
        expect(secondPage.items).toHaveLength(1)
        expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id)

        // Tenant vizinho não enxerga nenhuma viagem, mesmo sem filtro.
        expect(
          await repository.list({ companyId: otherCompanyId, cursor: null, limit: 10 }),
        ).toEqual({ items: [], nextCursor: null })
      })
    },
    30_000,
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedNfeDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly status?: 'authorized' | 'cancelled'
    readonly suffix: string
    readonly userId: string
  },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-import-${input.suffix}`,
    id: importId,
    idempotencyKey: `import-${input.suffix}`,
    requestFingerprint: `fingerprint-import-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-nfe-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-07-22T12:00:00.000Z'),
    model: '55',
    number: input.suffix,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: input.status ?? 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })
  return documentId
}

async function seedFreightCalculation(
  database: TestDatabase,
  input: { readonly companyId: string; readonly nfeDocumentId: string; readonly userId: string },
): Promise<string> {
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const calculationId = crypto.randomUUID()

  await database.db.insert(freightRules).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: ruleId,
    name: 'Frete de integracao',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId: ruleId,
    id: versionId,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '350.0000',
    calculationDetails: {},
    companyId: input.companyId,
    correlationId: 'correlation-freight-trip-repository',
    createdByUserId: input.userId,
    freightRuleId: ruleId,
    freightRuleVersionId: versionId,
    id: calculationId,
    idempotencyKey: 'freight-trip-repository',
    nfeDocumentId: input.nfeDocumentId,
    percentage: '0.035000',
    requestFingerprint: 'fingerprint-freight-trip-repository',
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '350.0000',
  })
  return calculationId
}

/**
 * Cadeia completa `cte_batches` → `cte_batch_items` → `cte_issuance_attempts` → `cte_fiscal_documents`
 * (T011): a única fonte real de "CT-e autorizado" para uma NF-e. `suffix` é um único dígito — vira
 * chave de acesso de 44 dígitos junto com o padding, e mantém idempotência/correlação únicas por chamada.
 */
async function seedCteFiscalDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly nfeDocumentId: string
    readonly status: 'authorized' | 'cancelled'
    readonly suffix: string
    readonly userId: string
  },
): Promise<void> {
  const batchId = crypto.randomUUID()
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const freightCalculationId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const attemptId = crypto.randomUUID()
  const cteXmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)
  const fiscalNumber = BigInt(`50${input.suffix}`)
  const isCancelled = input.status === 'cancelled'

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: cteXmlObjectId,
    mimeType: 'application/xml',
    objectKey: `cte/${input.suffix}.xml`,
    provider: 's3',
    purpose: 'cte_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(freightRules).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: ruleId,
    name: `Frete CT-e ${input.suffix}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId: ruleId,
    id: versionId,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '350.0000',
    calculationDetails: {},
    companyId: input.companyId,
    correlationId: `correlation-freight-cte-${input.suffix}`,
    createdByUserId: input.userId,
    freightRuleId: ruleId,
    freightRuleVersionId: versionId,
    id: freightCalculationId,
    idempotencyKey: `freight-cte-${input.suffix}`,
    nfeDocumentId: input.nfeDocumentId,
    percentage: '0.035000',
    requestFingerprint: `fingerprint-freight-cte-${input.suffix}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '350.0000',
  })
  await database.db.insert(cteBatches).values({
    companyId: input.companyId,
    correlationId: `correlation-batch-${input.suffix}`,
    id: batchId,
    idempotencyFingerprint: `fingerprint-batch-${input.suffix}`,
    idempotencyKey: `batch-${input.suffix}`,
    name: `Lote ${input.suffix}`,
    operatorUserId: input.userId,
    status: 'submitted',
    version: 1n,
  })
  await database.db.insert(cteBatchItems).values({
    batchId,
    calculationSnapshot: { baseAmount: '10000.0000', calculatedAmount: '350.0000' },
    companyId: input.companyId,
    freightCalculationId,
    id: itemId,
    nfeDocumentId: input.nfeDocumentId,
    position: 1n,
  })
  // `series` varia por chamada — a unique constraint de `fiscal_sequences` é por
  // (companyId, environment, model, series), e esta função pode rodar mais de uma vez na mesma empresa.
  const series = BigInt(input.suffix)
  await database.db.insert(fiscalSequences).values({
    companyId: input.companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId: input.companyId,
    fiscalSequenceId,
    id: reservationId,
    number: 1n,
    reservationKey: `reservation-cte-${input.suffix}`,
  })
  await database.db.insert(cteIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    batchId,
    batchItemId: itemId,
    companyId: input.companyId,
    correlationId: `correlation-cte-attempt-${input.suffix}`,
    fiscalEnvironment: 'homologation',
    fiscalNumber,
    fiscalSeries: '1',
    id: attemptId,
    idempotencyFingerprint: `fingerprint-cte-attempt-${input.suffix}`,
    idempotencyKey: `cte-attempt-${input.suffix}`,
    requestFingerprint: `request-cte-attempt-${input.suffix}`,
    reservationId,
    status: 'authorized',
  })
  await database.db.insert(cteFiscalDocuments).values({
    accessKey: `${input.suffix}${'2'.repeat(43)}`,
    attemptId,
    authorizationProtocol: `protocol-cte-${input.suffix}`,
    authorizedAt: new Date('2026-07-22T20:00:00.000Z'),
    batchItemId: itemId,
    cancellationJustification: isCancelled ? 'Cancelamento de teste de integracao' : null,
    cancellationProtocol: isCancelled ? `cancel-protocol-${input.suffix}` : null,
    cancellationRequestedAt: isCancelled ? new Date('2026-07-23T10:00:00.000Z') : null,
    cancelledAt: isCancelled ? new Date('2026-07-23T10:05:00.000Z') : null,
    companyId: input.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber,
    fiscalSeries: '1',
    id: crypto.randomUUID(),
    status: input.status,
    xmlObjectId: cteXmlObjectId,
    xmlSha256: sha,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t007_${crypto.randomUUID().replaceAll('-', '')}`
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
