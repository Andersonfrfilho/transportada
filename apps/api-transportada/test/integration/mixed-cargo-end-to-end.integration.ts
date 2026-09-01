/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 065, T018 — **a carga mista, do barracão ao manifesto, contra Postgres de verdade.**
 *
 * A carga de todo dia leva entrega no município da transportadora (que vira NFS-e e **nunca** terá
 * CT-e) junto com entrega de fora (que vira CT-e). Foi essa mistura que expôs os dois defeitos da
 * spec: o portão exigia `dispatched` exato, e a prontidão só sabia de CT-e — a nota urbana ficava
 * pendente para sempre e travava a viagem inteira.
 *
 * Cada pedaço já tem contrato e integração próprios. O que **só** este teste prova é a costura: as
 * mesmas linhas do banco atravessando criar → vincular → planejar → separar → carregar → despachar →
 * lote urgente → CT-e autorizado → prontidão → manifesto automático → o motorista com o documento na
 * mão. É onde moraram os defeitos de fiação que nenhum dublê pegou.
 *
 * Duas fronteiras ficam de fora, e por bons motivos: a **SEFAZ** (a autorização de CT-e e de MDF-e é
 * escrita aqui como o worker a escreve, porque assinar e transmitir exige certificado e rede) e a
 * criação do lote de CT-e, que é injetada — montá-la de verdade arrastaria cálculo de frete, que tem
 * integração própria e não é o que esta costura investiga.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

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
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRuleVersions,
  freightRules,
  identityUsers,
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeVolumes,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createMdfeManifestsUseCase } from '../../src/mdfe-manifests/application/mdfe-manifests.use-case.js'
import { createTripMdfeManifestUseCase } from '../../src/mdfe-manifests/application/create-trip-mdfe-manifest.use-case.js'
import { issueTripManifestAutomatically } from '../../src/mdfe-manifests/application/issue-trip-manifest-automatically.use-case.js'
import { DrizzleAutomaticManifestRepository } from '../../src/mdfe-manifests/infrastructure/drizzle-automatic-manifest.repository.js'
import { DrizzleMdfeManifestRepository } from '../../src/mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository.js'
import { createMdfeDocumentSource } from '../../src/mdfe-manifests/infrastructure/mdfe-document.query.js'
import { createTripCteBatch } from '../../src/trips/application/create-trip-cte-batch.use-case.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { readTripFiscalReadiness } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripFiscalReadinessQuery } from '../../src/trips/infrastructure/trip-fiscal-readiness.query.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_CITY_CODE = '3543402'
const OTHER_CITY_CODE = '3551702'
const DRIVER_TAX_ID = '11111111111'
const SHA = '1'.repeat(64)

describe('a carga mista, do barracão ao manifesto (spec 065 T018)', () => {
  testWithPostgres(
    'a nota urbana não trava a viagem, e o motorista termina com o MDF-e na mão',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWarehouse(database)
        const { companyId, driverId, membershipId, userId, vehicleId } = world

        const tripRepository = new DrizzleTripRepository(database.db)
        const routeRepository = new DrizzleTripRouteRepository(database.db)
        const documentRepository = new DrizzleTripDocumentRepository(database.db)
        const readinessQuery = new DrizzleTripFiscalReadinessQuery(database.db)

        const trip = await tripRepository.create({
          companyId,
          crew: [
            { driverId, driverName: 'Motorista Misto', driverTaxId: DRIVER_TAX_ID, position: 1 },
          ],
          vehicleId,
        })

        const linked = []
        for (const nfeDocumentId of world.nfeDocumentIds) {
          linked.push(
            await tripRepository.linkDocument({
              companyId,
              freightCalculationId: null,
              nfeDocumentId,
              tripId: trip.id,
            }),
          )
        }
        // Duas cidades: a urbana e as duas de fora, que dividem endereço — três notas, duas paradas.
        expect(new Set(linked.map((document) => document.stopId)).size).toBe(2)

        await planTripRoute({ companyId, repository: routeRepository, tripId: trip.id })
        for (const action of ['separate', 'load'] as const) {
          for (const document of linked) {
            await transitionTripDocument({
              action,
              actorUserId: userId,
              companyId,
              documentId: document.id,
              repository: documentRepository,
              tripId: trip.id,
            })
          }
        }
        const dispatched = await dispatchTrip({
          actorUserId: userId,
          companyId,
          repository: routeRepository,
          tripId: trip.id,
        })
        expect(dispatched.tripStatus).toBe('dispatched')

        /**
         * Antes de qualquer CT-e, a viagem já saiu — e é isso que a operação faz. A prontidão tem de
         * dizer que falta CT-e **das duas de fora**, e contar a urbana como NFS-e, não como pendência
         * de manifesto.
         */
        const beforeBatch = await readTripFiscalReadiness({
          companyId,
          repository: readinessQuery,
          tripId: trip.id,
        })
        expect(beforeBatch.state).toBe('incomplete')
        expect(beforeBatch.manifestableCount).toBe(2)
        expect(beforeBatch.nfseCount).toBe(1)

        // O lote urgente da viagem leva **só** as notas de CT-e: a urbana nunca entra num lote.
        const requestedBatches: readonly string[][] = []
        const batch = await createTripCteBatch({
          companyId,
          correlationId: 'correlation-mixed-cargo',
          createBatch: (input) => {
            ;(requestedBatches as string[][]).push([...input.documentIds])
            return Promise.resolve({ id: world.batchId })
          },
          idempotencyKey: 'mixed-cargo-urgent',
          readReadiness: (input) =>
            readTripFiscalReadiness({ ...input, repository: readinessQuery }),
          tripId: trip.id,
          userId,
        })
        expect(batch.documentCount).toBe(2)
        expect(requestedBatches[0]?.toSorted()).toEqual(
          [...world.interstateNfeDocumentIds].toSorted(),
        )

        // A SEFAZ autoriza os dois CT-e — escrito aqui como o worker escreve na volta.
        await authorizeCteDocuments(database, world)

        const afterAuthorization = await readTripFiscalReadiness({
          companyId,
          repository: readinessQuery,
          tripId: trip.id,
        })
        expect(afterAuthorization.state).toBe('ready')
        expect(afterAuthorization.readyCount).toBe(2)
        // A nota urbana continua sendo NFS-e esperada, e não é isso que segura o manifesto.
        expect(
          afterAuthorization.documents.filter((document) => document.reason === 'nfse_expected'),
        ).toHaveLength(1)

        const manifests = createMdfeManifestsUseCase({
          repository: new DrizzleMdfeManifestRepository(database.db),
        })
        const automatic = await issueTripManifestAutomatically({
          context: { companyId, userId },
          correlationId: 'correlation-mixed-cargo-manifest',
          createManifest: createTripMdfeManifestUseCase({
            manifests,
            readiness: {
              countDischargeCities: (input) => readinessQuery.countDischargeCities(input),
              read: (input) => readTripFiscalReadiness({ ...input, repository: readinessQuery }),
            },
            trips: {
              get: async ({ tripId }) => {
                const found = await tripRepository.findById({ companyId, tripId })
                if (found === null) throw new Error('trip disappeared mid-test')
                return {
                  drivers: [{ driverId }],
                  id: found.id,
                  requiresMdfe: null,
                  status: found.status,
                  vehicleId,
                }
              },
            },
          }),
          repository: new DrizzleAutomaticManifestRepository({
            database: database.db,
            readiness: readinessQuery,
          }),
          tripId: trip.id,
        })
        expect({ code: automatic.refusalCode, outcome: automatic.outcome }).toEqual({
          code: null,
          outcome: 'issued',
        })
        expect(automatic.manifestId).not.toBeNull()

        // A SEFAZ autoriza o manifesto — de novo, escrito como o worker escreve.
        const accessKey = await authorizeManifest(database, {
          companyId,
          manifestId: automatic.manifestId ?? '',
        })

        const driverTrips = await findCurrentDriverTrip({
          companyId,
          membershipId,
          repository: new DrizzleCurrentDriverTripRepository(database.db),
        })
        const driverTrip = driverTrips.trips.find((candidate) => candidate.id === trip.id)
        expect(driverTrip?.manifest?.accessKey).toBe(accessKey)

        // E o documento chega a ele pela própria escala, que é o que o botão da tela faz.
        const document = await createMdfeDocumentSource(database.db).findAuthorizedDocument({
          companyId,
          driverId,
          manifestId: automatic.manifestId ?? '',
        })
        expect(document.kind).toBe('authorized')
      })
    },
    60_000,
  )
})

type World = {
  readonly batchId: string
  readonly companyId: string
  readonly driverId: string
  readonly interstateNfeDocumentIds: readonly string[]
  readonly membershipId: string
  readonly nfeDocumentIds: readonly string[]
  readonly userId: string
  readonly vehicleId: string
}

async function seedWarehouse(database: TestDatabase): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const batchId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(companyFiscalProfiles).values({
    // Sem o município da empresa não há classificação: toda nota ficaria indecisa.
    automaticMdfeOnCompletion: true,
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
  // O motorista é ligado ao **vínculo**, que é como a tela dele resolve quem ele é.
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista Misto',
    taxId: DRIVER_TAX_ID,
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-mixed-cargo',
    id: importId,
    idempotencyKey: 'mixed-cargo',
    requestFingerprint: 'fingerprint-mixed-cargo',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(cteBatches).values({
    companyId,
    correlationId: 'correlation-mixed-cargo-batch',
    id: batchId,
    idempotencyFingerprint: 'fingerprint-mixed-cargo-batch',
    idempotencyKey: 'mixed-cargo-batch',
    name: 'Lote urgente da viagem',
    operatorUserId: userId,
    status: 'submitted',
    version: 1n,
  })

  const nfeDocumentIds: string[] = []
  const interstateNfeDocumentIds: string[] = []
  for (const [index, destination] of ['interstate', 'interstate', 'urban'].entries()) {
    const nfeDocumentId = await seedNote(database, {
      companyId,
      importId,
      index,
      isUrban: destination === 'urban',
      userId,
    })
    nfeDocumentIds.push(nfeDocumentId)
    if (destination === 'interstate') interstateNfeDocumentIds.push(nfeDocumentId)
  }

  return {
    batchId,
    companyId,
    driverId,
    interstateNfeDocumentIds,
    membershipId,
    nfeDocumentIds,
    userId,
    vehicleId,
  }
}

async function seedNote(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly importId: string
    readonly index: number
    readonly isUrban: boolean
    readonly userId: string
  },
): Promise<string> {
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/mixed-${input.index}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.index + 1}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-mixed-${input.index}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId: input.importId,
    issuedAt: new Date('2026-08-26T06:00:00.000Z'),
    model: '55',
    number: String(700_000 + input.index),
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })

  /**
   * Três papéis, e cada um responde por uma coisa: `sender` e `recipient` decidem o **documento**
   * (a classificação olha o destinatário), e `emitter` é de onde a carga **sai** — é ele que o
   * MDF-e usa como município de carregamento. Sem o emitente o manifesto recusa por cidade de
   * carregamento ausente, que foi o que este teste pegou na primeira execução.
   */
  for (const [role, cityCode] of [
    ['emitter', COMPANY_CITY_CODE],
    ['sender', COMPANY_CITY_CODE],
    ['recipient', input.isUrban ? COMPANY_CITY_CODE : OTHER_CITY_CODE],
  ] as const) {
    const participantId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId: input.companyId,
      documentId: nfeDocumentId,
      id: participantId,
      legalName: `Participante ${role} ${input.index}`,
      role,
    })
    await database.db.insert(nfeAddresses).values({
      city: cityCode === COMPANY_CITY_CODE ? 'Ribeirao Preto' : 'Sertaozinho',
      cityCode,
      companyId: input.companyId,
      // As duas de fora dividem endereço: elas viram uma parada, e a urbana vira outra.
      number: input.isUrban ? '900' : '100',
      participantId,
      postalCode: input.isUrban ? '14010200' : '14010100',
      state: 'SP',
      street: 'Rua da Entrega',
    })
  }

  // O peso do MDF-e sai dos volumes da nota: sem eles o documento é bloqueado por totais ausentes.
  await database.db.insert(nfeVolumes).values({
    companyId: input.companyId,
    documentId: nfeDocumentId,
    grossWeight: '320.5000',
    netWeight: '300.0000',
    ordinal: 1n,
    quantity: '2',
    species: 'CAIXA',
  })

  return nfeDocumentId
}

/** O que o worker grava quando a SEFAZ autoriza: tentativa liquidada e documento fiscal. */
async function authorizeCteDocuments(database: TestDatabase, world: World): Promise<void> {
  const fiscalSequenceId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()

  // O item do lote nasce de um cálculo de frete — a coluna é obrigatória, e é assim na produção.
  await database.db.insert(freightRules).values({
    companyId: world.companyId,
    createdByUserId: world.userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete carga mista',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: world.companyId,
    createdByUserId: world.userId,
    filters: {},
    freightRuleId,
    id: freightRuleVersionId,
    percentage: '0.045000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })

  await database.db.insert(fiscalSequences).values({
    companyId: world.companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 2n,
    model: 'cte',
    nextNumber: 3n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: world.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'cte/mixed.xml',
    provider: 's3',
    purpose: 'cte_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })

  for (const [index, nfeDocumentId] of world.interstateNfeDocumentIds.entries()) {
    const batchItemId = crypto.randomUUID()
    const attemptId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    const freightCalculationId = crypto.randomUUID()

    await database.db.insert(freightCalculations).values({
      adjustments: [],
      baseAmount: '1000.0000',
      calculatedAmount: '45.0000',
      calculationDetails: {},
      companyId: world.companyId,
      correlationId: `correlation-mixed-freight-${index}`,
      createdByUserId: world.userId,
      freightRuleId,
      freightRuleVersionId,
      id: freightCalculationId,
      idempotencyKey: `mixed-freight-${index}`,
      nfeDocumentId,
      percentage: '0.045000',
      requestFingerprint: `fingerprint-mixed-freight-${index}`,
      ruleSnapshot: {},
      ruleVersion: 1n,
      status: 'snapshotted',
      totalAmount: '45.0000',
    })
    await database.db.insert(cteBatchItems).values({
      batchId: world.batchId,
      calculationSnapshot: {},
      companyId: world.companyId,
      freightCalculationId,
      id: batchItemId,
      nfeDocumentId,
      position: BigInt(index + 1),
    })
    await database.db.insert(fiscalSequenceReservations).values({
      companyId: world.companyId,
      fiscalSequenceId,
      id: reservationId,
      number: BigInt(index + 1),
      reservationKey: `reservation-mixed-${index}`,
    })
    await database.db.insert(cteIssuanceAttempts).values({
      attemptKind: 'issue',
      attemptNumber: 1n,
      batchId: world.batchId,
      batchItemId,
      companyId: world.companyId,
      correlationId: `correlation-mixed-attempt-${index}`,
      fiscalEnvironment: 'homologation',
      fiscalNumber: BigInt(index + 1),
      fiscalSeries: '1',
      id: attemptId,
      idempotencyFingerprint: `fingerprint-mixed-attempt-${index}`,
      idempotencyKey: `mixed-attempt-${index}`,
      requestFingerprint: `request-mixed-attempt-${index}`,
      reservationId,
      status: 'authorized',
    })
    await database.db.insert(cteFiscalDocuments).values({
      accessKey: `${index + 5}${'2'.repeat(43)}`,
      attemptId,
      authorizationProtocol: `protocol-mixed-cte-${index}`,
      authorizedAt: new Date('2026-08-26T07:00:00.000Z'),
      batchItemId,
      companyId: world.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: BigInt(index + 1),
      fiscalSeries: '1',
      status: 'authorized',
      xmlObjectId,
      xmlSha256: SHA,
    })
  }
}

async function authorizeManifest(
  database: TestDatabase,
  input: { readonly companyId: string; readonly manifestId: string },
): Promise<string> {
  const accessKey = `3${'5'.repeat(43)}`
  const attemptId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(fiscalSequences).values({
    companyId: input.companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 1n,
    model: 'mdfe',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId: input.companyId,
    fiscalSequenceId,
    id: reservationId,
    number: 1n,
    reservationKey: 'reservation-mixed-mdfe',
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'mdfe/mixed.xml',
    provider: 's3',
    purpose: 'mdfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(mdfeIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    companyId: input.companyId,
    correlationId: 'correlation-mixed-mdfe',
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    id: attemptId,
    idempotencyFingerprint: 'fingerprint-mixed-mdfe',
    idempotencyKey: 'mixed-mdfe',
    manifestId: input.manifestId,
    requestFingerprint: 'request-mixed-mdfe',
    reservationId,
    status: 'authorized',
  })
  await database.db.insert(mdfeFiscalDocuments).values({
    accessKey,
    attemptId,
    authorizationProtocol: 'protocol-mixed-mdfe',
    authorizedAt: new Date('2026-08-26T08:00:00.000Z'),
    companyId: input.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: 1n,
    fiscalSeries: '1',
    manifestId: input.manifestId,
    status: 'authorized',
    xmlObjectId,
    xmlSha256: SHA,
  })

  return accessKey
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_065_e2e_${crypto.randomUUID().replaceAll('-', '')}`
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
