/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 059, T006 — a prontidão contra Postgres de verdade. Ela é um `left join` de quatro tabelas
 * atravessando dois caminhos de vínculo (nota direta e cálculo de frete); contrato com dublê passa
 * com o `join` errado, e o `join` errado aqui declara à SEFAZ um CT-e que não é daquela nota.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, inArray } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyFiscalProfiles,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetVehicles,
  freightCalculations,
  freightRuleVersions,
  freightRules,
  identityUsers,
  mdfeManifests,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDocuments, trips } from '../../src/database/trip.schema.js'
import { readTripFiscalReadiness } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import { DrizzleTripFiscalReadinessQuery } from '../../src/trips/infrastructure/trip-fiscal-readiness.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Quatro notas: três de entrega **fora** do município da transportadora — uma com CT-e autorizado,
 * uma rejeitada e uma sem CT-e — e uma de entrega **urbana**, que vira NFS-e e nunca terá CT-e.
 *
 * Essa quarta é a que prova o defeito da spec 065: numa carga mista, esperar por ela travaria a
 * viagem inteira e o manifesto automático não dispararia nunca.
 */
type Outcome = 'authorized' | 'none' | 'rejected' | 'urban'

const COMPANY_CITY_CODE = '3543402'
const OTHER_CITY_CODE = '3551702'

type World = {
  readonly companyId: string
  readonly tripDocumentIdByOutcome: ReadonlyMap<Outcome, string>
  readonly tripId: string
  readonly vehicleId: string
}

describe('a prontidão fiscal da viagem (spec 059 T006)', () => {
  testWithPostgres('diz por nota o que falta, numa consulta só', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTrip(database)
      const query = new DrizzleTripFiscalReadinessQuery(database.db)

      const readiness = await readTripFiscalReadiness({
        companyId: world.companyId,
        repository: query,
        tripId: world.tripId,
      })

      expect(readiness).toMatchObject({
        manifestableCount: 3,
        nfseCount: 1,
        readyCount: 1,
        state: 'incomplete',
        totalCount: 4,
      })
      // A nota urbana é NFS-e e não conta para o manifesto — é o defeito que a 065 conserta
      expect(
        readiness.documents.find(
          (entry) => entry.tripDocumentId === world.tripDocumentIdByOutcome.get('urban'),
        ),
      ).toMatchObject({ expectedDocument: 'nfse', reason: 'nfse_expected' })
      const byDocument = new Map(
        readiness.documents.map((entry) => [entry.tripDocumentId, entry]),
      )
      expect(byDocument.get(world.tripDocumentIdByOutcome.get('authorized') ?? '')).toMatchObject({
        reason: 'ok',
      })
      expect(byDocument.get(world.tripDocumentIdByOutcome.get('rejected') ?? '')).toMatchObject({
        reason: 'cte_rejected',
        rejectionCode: '539',
      })
      expect(byDocument.get(world.tripDocumentIdByOutcome.get('none') ?? '')).toMatchObject({
        reason: 'no_cte',
      })
    })
  })

  /** A viagem só fica pronta quando **toda** nota tem CT-e autorizado — não a maioria. */
  testWithPostgres('vira ready quando a última nota é autorizada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTrip(database)
      const query = new DrizzleTripFiscalReadinessQuery(database.db)

      // Desvincular as duas pendentes é o caminho da P2 da spec: a viagem segue sem elas.
      // A urbana **fica**, e é justamente ela que não pode impedir a viagem de ficar pronta.
      await database.db.delete(tripDocuments).where(
        inCompanyDocuments(world, ['none', 'rejected']),
      )

      const readiness = await readTripFiscalReadiness({
        companyId: world.companyId,
        repository: query,
        tripId: world.tripId,
      })

      expect(readiness).toMatchObject({
        manifestableCount: 1,
        nfseCount: 1,
        readyCount: 1,
        state: 'ready',
        totalCount: 2,
      })
    })
  })

  /**
   * O caso da P2: o manifesto foi autorizado e depois um CT-e foi cancelado. O sistema **não**
   * cancela o manifesto sozinho — ele para de ser silencioso.
   */
  testWithPostgres('manifesto vivo sobre CT-e cancelado é divergente', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTrip(database)
      await database.db.delete(tripDocuments).where(inCompanyDocuments(world, ['none', 'rejected']))
      await database.db.insert(mdfeManifests).values({
        companyId: world.companyId,
        destinationState: 'MG',
        fiscalEnvironment: 'homologation',
        originState: 'SP',
        status: 'draft',
        tripId: world.tripId,
        vehicleId: world.vehicleId,
      })

      const query = new DrizzleTripFiscalReadinessQuery(database.db)
      expect(
        (
          await readTripFiscalReadiness({
            companyId: world.companyId,
            repository: query,
            tripId: world.tripId,
          })
        ).state,
      ).toBe('manifested')

      await database.db
        .update(cteFiscalDocuments)
        .set({
          cancellationJustification: 'Cancelamento a pedido do tomador da carga transportada',
          cancellationProtocol: 'protocol-cancel-0',
          cancelledAt: new Date('2026-08-26T09:00:00.000Z'),
          status: 'cancelled',
        })
        .where(eqCompany(world.companyId))

      expect(
        (
          await readTripFiscalReadiness({
            companyId: world.companyId,
            repository: query,
            tripId: world.tripId,
          })
        ).state,
      ).toBe('divergent')
    })
  })

  /**
   * O caso que a 059 não previa e que a 065 conserta: viagem cujas entregas são todas no município da
   * transportadora. Ela não é "incompleta" — ela **não manifesta**, e o botão não deve nem aparecer.
   */
  testWithPostgres('viagem só de entrega urbana não tem manifesto a emitir', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTrip(database)
      await database.db
        .delete(tripDocuments)
        .where(inCompanyDocuments(world, ['authorized', 'none', 'rejected']))

      const readiness = await readTripFiscalReadiness({
        companyId: world.companyId,
        repository: new DrizzleTripFiscalReadinessQuery(database.db),
        tripId: world.tripId,
      })

      expect(readiness).toMatchObject({
        manifestableCount: 0,
        nfseCount: 1,
        state: 'not_applicable',
        totalCount: 1,
      })
    })
  })
})

function eqCompany(companyId: string) {
  return eq(cteFiscalDocuments.companyId, companyId)
}

function inCompanyDocuments(world: World, outcomes: readonly Outcome[]) {
  return inArray(
    tripDocuments.id,
    outcomes.map((outcome) => world.tripDocumentIdByOutcome.get(outcome) ?? ''),
  )
}

async function seedTrip(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const nfeXmlObjectId = crypto.randomUUID()
  const cteXmlObjectId = crypto.randomUUID()
  const sha = '1'.repeat(64)

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  // Sem o município da empresa não há classificação possível: toda nota ficaria indecisa.
  await database.db.insert(companyFiscalProfiles).values({
    city: 'Ribeirao Preto',
    cityIbgeCode: COMPANY_CITY_CODE,
    cnpj: '12345678000190',
    companyId,
    complement: '',
    district: 'Centro',
    email: 'fiscal@example.com',
    environment: 'homologation',
    legalName: 'Transportada Exemplo LTDA',
    municipalRegistration: '000000',
    number: '100',
    phone: '1633333333',
    postalCode: '14010100',
    rntrc: '12345678',
    state: 'SP',
    stateRegistration: '110042490114',
    street: 'Rua do Barracao',
    taxRegime: '1',
    tradeName: 'Transportada',
  })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .insert(trips)
    .values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId,
      id: nfeXmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'nfe/readiness.xml',
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
      objectKey: 'cte/readiness.xml',
      provider: 's3',
      purpose: 'cte_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-readiness',
    id: importId,
    idempotencyKey: 'readiness',
    requestFingerprint: 'fingerprint-readiness',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete prontidão',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: userId,
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
    correlationId: 'correlation-batch-readiness',
    id: batchId,
    idempotencyFingerprint: 'fingerprint-batch-readiness',
    idempotencyKey: 'batch-readiness',
    name: 'Lote prontidão',
    operatorUserId: userId,
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
    reservationKey: 'reservation-readiness',
  })

  const tripDocumentIdByOutcome = new Map<Outcome, string>()
  const outcomes: readonly Outcome[] = ['authorized', 'rejected', 'none', 'urban']

  for (const [index, outcome] of outcomes.entries()) {
    const nfeDocumentId = crypto.randomUUID()
    await database.db.insert(nfeDocuments).values({
      accessKey: `${index + 1}${'1'.repeat(43)}`,
      authorizationProtocol: `protocol-readiness-${index}`,
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: nfeDocumentId,
      importId,
      issuedAt: new Date('2026-08-26T06:00:00.000Z'),
      model: '55',
      number: String(900_000 + index),
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId: nfeXmlObjectId,
      xmlSha256: sha,
    })

    /**
     * O município vem do endereço do participante da própria nota — é o trajeto real. `sender` sempre
     * no município da transportadora (a coleta é aqui); `recipient` é o que decide o documento.
     */
    for (const [role, cityCode] of [
      ['sender', COMPANY_CITY_CODE],
      ['recipient', outcome === 'urban' ? COMPANY_CITY_CODE : OTHER_CITY_CODE],
    ] as const) {
      const participantId = crypto.randomUUID()
      await database.db.insert(nfeParticipants).values({
        companyId,
        documentId: nfeDocumentId,
        id: participantId,
        legalName: `Participante ${role} ${index}`,
        role,
      })
      await database.db.insert(nfeAddresses).values({
        city: cityCode === COMPANY_CITY_CODE ? 'Ribeirao Preto' : 'Sertaozinho',
        cityCode,
        companyId,
        number: '100',
        participantId,
        postalCode: '14010100',
        state: 'SP',
        street: 'Rua da Entrega',
      })
    }

    const tripDocumentId = crypto.randomUUID()
    await database.db.insert(tripDocuments).values({
      companyId,
      id: tripDocumentId,
      nfeDocumentId,
      separationStatus: 'loaded',
      tripId,
    })
    tripDocumentIdByOutcome.set(outcome, tripDocumentId)

    if (outcome === 'none' || outcome === 'urban') continue

    const freightCalculationId = crypto.randomUUID()
    await database.db.insert(freightCalculations).values({
      adjustments: [],
      baseAmount: '1000.0000',
      calculatedAmount: '45.0000',
      calculationDetails: {},
      companyId,
      correlationId: `correlation-freight-${index}`,
      createdByUserId: userId,
      freightRuleId,
      freightRuleVersionId,
      id: freightCalculationId,
      idempotencyKey: `freight-${index}`,
      nfeDocumentId,
      percentage: '0.045000',
      requestFingerprint: `fingerprint-freight-${index}`,
      ruleSnapshot: {},
      ruleVersion: 1n,
      status: 'snapshotted',
      totalAmount: '45.0000',
    })

    const batchItemId = crypto.randomUUID()
    await database.db.insert(cteBatchItems).values({
      batchId,
      calculationSnapshot: {},
      companyId,
      freightCalculationId,
      id: batchItemId,
      nfeDocumentId,
      position: BigInt(index + 1),
    })

    const attemptId = crypto.randomUUID()
    await database.db.insert(cteIssuanceAttempts).values({
      attemptKind: 'issue',
      attemptNumber: 1n,
      batchId,
      batchItemId,
      companyId,
      correlationId: `correlation-attempt-${index}`,
      fiscalEnvironment: 'homologation',
      fiscalNumber: BigInt(5_000 + index),
      fiscalSeries: '1',
      id: attemptId,
      idempotencyFingerprint: `fingerprint-attempt-${index}`,
      idempotencyKey: `attempt-${index}`,
      ...(outcome === 'rejected'
        ? { lastErrorCause: 'Duplicidade de CT-e', lastErrorCode: '539' }
        : {}),
      requestFingerprint: `request-attempt-${index}`,
      reservationId,
      status: outcome === 'authorized' ? 'authorized' : 'rejected',
    })

    if (outcome !== 'authorized') continue

    await database.db.insert(cteFiscalDocuments).values({
      accessKey: `${index + 5}${'2'.repeat(43)}`,
      attemptId,
      authorizationProtocol: `protocol-cte-${index}`,
      authorizedAt: new Date('2026-08-26T07:00:00.000Z'),
      batchItemId,
      companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: BigInt(5_000 + index),
      fiscalSeries: '1',
      status: 'authorized',
      xmlObjectId: cteXmlObjectId,
      xmlSha256: sha,
    })
  }

  return { companyId, tripDocumentIdByOutcome, tripId, vehicleId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_059_${crypto.randomUUID().replaceAll('-', '')}`
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
