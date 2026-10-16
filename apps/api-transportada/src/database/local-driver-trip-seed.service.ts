/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Semente da **viagem do motorista** da bancada local: 1 viagem despachada, 3 paradas e 6 notas, do
 * motorista `local-user`, para o app do motorista ter o que entregar sem depender de XML de
 * terceiro, de MinIO, do worker nem do OSRM. É o equivalente real da viagem fixa da API de
 * demonstração (`apps/frontend-driver/scripts/driver-preview-api.ts`).
 *
 * ⚠️ Diferente das outras sementes, esta grava por Drizzle e não por casos de uso. O caminho
 * "certo" (importar NF-e → processar no worker → separar → montar viagem → despachar) exige o
 * armazenamento de objetos, o worker e o roteirizador de pé, e o que se quer aqui é o estado final
 * (viagem `dispatched` com as notas carregadas), não o caminho até ele. Os dados são inventados,
 * como o resto da bancada (`local-trip-seed.constant.ts`).
 *
 * Idempotente e **redefinidora**: rodar de novo apaga a viagem semeada (e só ela, pelos ids fixos)
 * e a refaz — é o jeito de voltar ao começo depois de entregar tudo. Só em `local` e `test`.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, like } from 'drizzle-orm'

import { parseEnvironment } from '../config/environment.schema.js'
import {
  companyDeliveryProofSettings,
  fleetDrivers,
  fleetVehicles,
  geocodedAddresses,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
  storedObjects,
  tripDocuments,
  tripDrivers,
  tripStops,
  trips,
} from './database.schema.js'
import {
  LOCAL_DRIVER_TRIP_ID,
  LOCAL_DRIVER_TRIP_NOTES,
  LOCAL_DRIVER_TRIP_STOPS,
  LOCAL_DRIVER_TRIP_VEHICLE_PLATE,
} from './local-driver-trip-seed.constant.js'
import {
  LOCAL_COMPANY_ID,
  LOCAL_IDENTITY_USER_ID,
  LOCAL_MEMBERSHIP_ID,
} from './local-identity-seed.constant.js'

export type LocalDriverTripSeedResult = {
  readonly documents: number
  readonly driverId: string
  readonly stops: number
  readonly tripId: string
  readonly vehicleId: string
}

type RunLocalDriverTripSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const SEED_ACCESS_KEY_PREFIX = '35261000000000000000555'
const SEED_STORED_OBJECT_KEY = 'nfe/local-driver-trip-seed.xml'
const SEED_ISSUE_DATE = new Date('2026-10-14T12:00:00.000Z')
/** CPF de teste (dígitos verificadores válidos) do cadastro de motorista do `local-user`. */
const LOCAL_DRIVER_TAX_ID = '11144477735'
const LOCAL_DRIVER_NAME = 'Motorista Local'
const XML_SHA256 = 'c'.repeat(64)
const MINUTE_MS = 60_000

export async function runLocalDriverTripSeed({
  appEnvironment,
  environment,
}: RunLocalDriverTripSeedParams): Promise<LocalDriverTripSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local driver trip seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db
    const companyId = LOCAL_COMPANY_ID

    const driver = await resolveLocalDriver(database, companyId)
    const vehicleId = await resolveLocalVehicle(database, companyId)
    await resetSeededTrip(database, companyId)
    await saveCanhotoOnlyProofSettings(database, companyId)

    const importId = crypto.randomUUID()
    const xmlObjectId = await saveSeedSources(database, { companyId, importId })

    await database.insert(trips).values({
      companyId,
      id: LOCAL_DRIVER_TRIP_ID,
      status: 'dispatched',
      vehicleId,
    })
    await database.insert(tripDrivers).values({
      companyId,
      driverId: driver.id,
      driverName: driver.name,
      driverTaxId: driver.taxId,
      position: 1n,
      tripId: LOCAL_DRIVER_TRIP_ID,
    })

    const now = Date.now()
    let documentOrdinal = 0
    for (const [stopIndex, stop] of LOCAL_DRIVER_TRIP_STOPS.entries()) {
      const stopId = crypto.randomUUID()
      const addressKey = `${stop.cityCode}|${stop.postalCode}|${String(stopIndex + 1)}`
      await database
        .insert(geocodedAddresses)
        .values({
          addressKey,
          latitude: stop.latitude,
          longitude: stop.longitude,
          precision: 'rooftop',
          source: 'manual',
        })
        .onConflictDoNothing()
      await database.insert(tripStops).values({
        addressKey,
        companyId,
        deliveryWindowEnd: windowEdge(now, stop.windowEndMinutes),
        deliveryWindowStart: windowEdge(now, stop.windowStartMinutes),
        estimatedArrivalAt: new Date(now + (stopIndex + 1) * 45 * MINUTE_MS),
        id: stopId,
        label: `Parada ${String(stopIndex + 1)}`,
        sequence: BigInt(stopIndex + 1),
        tripId: LOCAL_DRIVER_TRIP_ID,
      })

      for (const note of LOCAL_DRIVER_TRIP_NOTES.filter((item) => item.stop === stopIndex + 1)) {
        documentOrdinal += 1
        const documentId = await saveNote(database, {
          companyId,
          documentOrdinal,
          importId,
          note,
          stop,
          xmlObjectId,
        })
        await database.insert(tripDocuments).values({
          companyId,
          loadedAt: new Date(now - 30 * MINUTE_MS),
          nfeDocumentId: documentId,
          separatedAt: new Date(now - 60 * MINUTE_MS),
          separationStatus: 'loaded',
          stopId,
          tripId: LOCAL_DRIVER_TRIP_ID,
        })
      }
    }

    return {
      documents: documentOrdinal,
      driverId: driver.id,
      stops: LOCAL_DRIVER_TRIP_STOPS.length,
      tripId: LOCAL_DRIVER_TRIP_ID,
      vehicleId,
    }
  } finally {
    await provider.close()
  }
}

type SeedDatabase = ReturnType<typeof createDrizzleProvider>['db']

function windowEdge(now: number, minutesFromNow: number): Date | null {
  return minutesFromNow === 0 ? null : new Date(now + minutesFromNow * MINUTE_MS)
}

/** O motorista da bancada é um cadastro da frota ligado ao vínculo do `local-user` (criado se não existir). */
async function resolveLocalDriver(
  database: SeedDatabase,
  companyId: string,
): Promise<{ readonly id: string; readonly name: string; readonly taxId: string }> {
  const linked = await database
    .select({ id: fleetDrivers.id, name: fleetDrivers.name, taxId: fleetDrivers.taxId })
    .from(fleetDrivers)
    .where(
      and(
        eq(fleetDrivers.companyId, companyId),
        eq(fleetDrivers.membershipId, LOCAL_MEMBERSHIP_ID),
      ),
    )
    .limit(1)
  if (linked[0] !== undefined) return linked[0]

  const driver = {
    id: crypto.randomUUID(),
    name: LOCAL_DRIVER_NAME,
    taxId: LOCAL_DRIVER_TAX_ID,
  }
  await database.insert(fleetDrivers).values({
    canDrive: true,
    companyId,
    id: driver.id,
    membershipId: LOCAL_MEMBERSHIP_ID,
    name: driver.name,
    taxId: driver.taxId,
  })
  return driver
}

async function resolveLocalVehicle(database: SeedDatabase, companyId: string): Promise<string> {
  const [seeded] = await database
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.companyId, companyId),
        eq(fleetVehicles.plate, LOCAL_DRIVER_TRIP_VEHICLE_PLATE),
      ),
    )
    .limit(1)
  if (seeded !== undefined) return seeded.id

  const [any] = await database
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.companyId, companyId), eq(fleetVehicles.role, 'traction')))
    .limit(1)
  if (any === undefined) {
    throw new Error('No fleet vehicle for the driver trip — run `make bench` (db:seed:trip) first')
  }
  return any.id
}

/** Apaga só o que esta semente criou: a viagem de id fixo e as notas de chave de acesso própria. */
async function resetSeededTrip(database: SeedDatabase, companyId: string): Promise<void> {
  const previous = await database
    .select({ id: nfeDocuments.id })
    .from(nfeDocuments)
    .where(
      and(
        eq(nfeDocuments.companyId, companyId),
        like(nfeDocuments.accessKey, `${SEED_ACCESS_KEY_PREFIX}%`),
      ),
    )
  const documentIds = previous.map((row) => row.id)

  await database.delete(tripDocuments).where(eq(tripDocuments.tripId, LOCAL_DRIVER_TRIP_ID))
  await database.delete(tripStops).where(eq(tripStops.tripId, LOCAL_DRIVER_TRIP_ID))
  await database.delete(tripDrivers).where(eq(tripDrivers.tripId, LOCAL_DRIVER_TRIP_ID))
  await database.delete(trips).where(eq(trips.id, LOCAL_DRIVER_TRIP_ID))
  if (documentIds.length > 0) {
    await database.delete(nfeVolumes).where(inArray(nfeVolumes.documentId, documentIds))
    await database.delete(nfeProducts).where(inArray(nfeProducts.documentId, documentIds))
    const participants = await database
      .select({ id: nfeParticipants.id })
      .from(nfeParticipants)
      .where(inArray(nfeParticipants.documentId, documentIds))
    const participantIds = participants.map((row) => row.id)
    if (participantIds.length > 0) {
      await database.delete(nfeAddresses).where(inArray(nfeAddresses.participantId, participantIds))
    }
    await database.delete(nfeParticipants).where(inArray(nfeParticipants.documentId, documentIds))
    await database.delete(nfeDocuments).where(inArray(nfeDocuments.id, documentIds))
  }
}

/** Hoje o único comprovante exigido é o canhoto: foto obrigatória, o resto desligado. */
async function saveCanhotoOnlyProofSettings(
  database: SeedDatabase,
  companyId: string,
): Promise<void> {
  const settings = {
    cargo: 'off',
    photo: 'required',
    receivedBy: 'off',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'off',
  } as const
  await database
    .insert(companyDeliveryProofSettings)
    .values({ companyId, ...settings })
    .onConflictDoUpdate({ set: settings, target: companyDeliveryProofSettings.companyId })
}

/** As notas apontam para um objeto e uma importação reais do ponto de vista do banco; o XML não existe. */
async function saveSeedSources(
  database: SeedDatabase,
  input: { readonly companyId: string; readonly importId: string },
): Promise<string> {
  const xmlObjectId = crypto.randomUUID()
  await database
    .delete(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.objectKey, SEED_STORED_OBJECT_KEY),
      ),
    )
  await database.insert(storedObjects).values({
    bucket: 'local-seed',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: SEED_STORED_OBJECT_KEY,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: XML_SHA256,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `local-driver-trip-seed-${input.importId}`,
    id: input.importId,
    idempotencyKey: `local-driver-trip-seed-${input.importId}`,
    requestFingerprint: `local-driver-trip-seed-${input.importId}`,
    requestedByUserId: LOCAL_IDENTITY_USER_ID,
    source: 'upload',
    status: 'completed',
  })
  return xmlObjectId
}

async function saveNote(
  database: SeedDatabase,
  input: {
    readonly companyId: string
    readonly documentOrdinal: number
    readonly importId: string
    readonly note: (typeof LOCAL_DRIVER_TRIP_NOTES)[number]
    readonly stop: (typeof LOCAL_DRIVER_TRIP_STOPS)[number]
    readonly xmlObjectId: string
  },
): Promise<string> {
  const { companyId, note, stop } = input
  const documentId = crypto.randomUUID()
  const recipientId = crypto.randomUUID()
  const totalValue = note.products
    .reduce((sum, product) => sum + product.quantity * product.unitValue, 0)
    .toFixed(4)

  await database.insert(nfeDocuments).values({
    accessKey: `${SEED_ACCESS_KEY_PREFIX}${String(input.documentOrdinal).padStart(21, '0')}`,
    authorizationProtocol: `1352610${String(input.documentOrdinal).padStart(8, '0')}`,
    companyId,
    createdByUserId: LOCAL_IDENTITY_USER_ID,
    id: documentId,
    importId: input.importId,
    issuedAt: SEED_ISSUE_DATE,
    model: '55',
    number: note.number,
    operationNature: 'Venda de mercadoria',
    operationType: '1',
    productsValue: totalValue,
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue,
    xmlObjectId: input.xmlObjectId,
    xmlSha256: XML_SHA256,
  })
  await database.insert(nfeParticipants).values([
    { companyId, documentId, legalName: 'Transportadora Local Ltda', role: 'emitter' },
    {
      companyId,
      documentId,
      id: recipientId,
      legalName: note.recipientName,
      role: 'recipient',
      taxId: note.recipientTaxId,
    },
  ])
  await database.insert(nfeAddresses).values({
    city: stop.city,
    cityCode: stop.cityCode,
    companyId,
    district: stop.district,
    number: stop.number,
    participantId: recipientId,
    postalCode: stop.postalCode,
    state: 'SP',
    street: stop.street,
  })
  await database.insert(nfeProducts).values(
    note.products.map((product, index) => ({
      cfop: '5102',
      code: product.code,
      commercialUnit: 'UN',
      companyId,
      description: product.description,
      documentId,
      ncm: '21069090',
      ordinal: BigInt(index + 1),
      quantity: product.quantity.toFixed(4),
      totalValue: (product.quantity * product.unitValue).toFixed(4),
      unitValue: product.unitValue.toFixed(4),
    })),
  )
  await database.insert(nfeVolumes).values({
    companyId,
    documentId,
    grossWeight: note.grossWeight,
    netWeight: note.netWeight,
    ordinal: 1n,
    quantity: note.volumes.toFixed(3),
    species: 'CAIXA',
  })
  return documentId
}

if (import.meta.main) {
  const result = await runLocalDriverTripSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(
    `driver trip seed: trip ${result.tripId} with ${result.stops} stop(s) and ` +
      `${result.documents} note(s) dispatched to the local driver ${result.driverId}\n`,
  )
}
