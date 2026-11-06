/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A viagem de três paradas da jornada do motorista (grupo e conversa individual): cada parada com uma nota, cliente,
 * contratante (emitente cadastrado), valor, volumes e endereço geocodificado. A viagem já está na rua (`dispatched`),
 * nenhuma parada saiu.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq } from 'drizzle-orm'

import {
  companies,
  contractors,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  membershipRoles,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeVolumes,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import {
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { findWhatsAppMarkupProblems } from './whatsapp-markup.fixture.js'

export type JourneyDatabase = ReturnType<typeof createDrizzleProvider>['db']

export type JourneyStop = {
  readonly city: string
  readonly client: string
  readonly documentId: string
  readonly label: string
  readonly latitude: string
  readonly longitude: string
  readonly number: string
  readonly stopId: string
  readonly value: string
  readonly volumes: string
}

export type JourneyWorld = {
  readonly companyId: string
  readonly driverId: string
  readonly membershipId: string
  readonly stops: readonly [JourneyStop, JourneyStop, JourneyStop]
  readonly tripId: string
  readonly userId: string
}

export const JOURNEY_CONTRACTOR = 'Distribuidora Aurora'

const STOPS = [
  {
    city: 'RIBEIRAO PRETO',
    client: 'PADARIA SOL NASCENTE',
    label: 'RUA DAS FLORES, 100, RIBEIRAO PRETO, SP',
    latitude: '-21.1700000',
    longitude: '-47.8100000',
    number: '17234',
    value: '1234.56',
    volumes: '3',
  },
  {
    city: 'SERTAOZINHO',
    client: 'MERCADO LUA CHEIA',
    label: 'AVENIDA BRASIL, 2500, SERTAOZINHO, SP',
    latitude: '-21.1400000',
    longitude: '-47.9900000',
    number: '17235',
    value: '99.90',
    volumes: '1',
  },
  {
    city: 'CRAVINHOS',
    client: 'ACOUGUE ESTRELA',
    label: 'RUA SETE, 7, CRAVINHOS, SP',
    latitude: '-21.3400000',
    longitude: '-47.7300000',
    number: '17236',
    value: '10.00',
    volumes: '12',
  },
] as const

export async function seedJourneyTrip(
  db: JourneyDatabase,
  input: { readonly driverPhone: string },
): Promise<JourneyWorld> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const emitterTaxId = '11222333000181'

  await db.insert(companies).values({ id: companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: userId, status: 'active' })
  await db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await db.insert(membershipRoles).values({ membershipId, role: 'driver' })
  await db
    .insert(contractors)
    .values({ companyId, displayName: JOURNEY_CONTRACTOR, taxId: emitterTaxId })
  await db.insert(fleetVehicles).values({
    bodyType: '02',
    companyId,
    id: vehicleId,
    plate: 'JRN1A23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'truck',
  })
  await db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista Jornada',
    phone: input.driverPhone,
    taxId: '11122233344',
  })
  await db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista Jornada',
    driverTaxId: '11122233344',
    position: 1n,
    tripId,
  })

  const seeded: JourneyStop[] = []
  for (const [index, stop] of STOPS.entries()) {
    const stopId = crypto.randomUUID()
    const addressKey = `journey|${companyId}|${index}`
    await db.insert(geocodedAddresses).values({
      addressKey,
      externalPlaceId: `place-${index}`,
      latitude: stop.latitude,
      longitude: stop.longitude,
      precision: 'rooftop',
      source: 'google',
    })
    await db.insert(tripStops).values({
      addressKey,
      companyId,
      id: stopId,
      label: stop.label,
      sequence: BigInt(index + 1),
      tripId,
    })
    const nfeDocumentId = await seedNfeDocument(db, {
      client: stop.client,
      companyId,
      emitterTaxId,
      number: stop.number,
      userId,
      value: stop.value,
      volumes: stop.volumes,
    })
    const documentId = crypto.randomUUID()
    await db.insert(tripDocuments).values({
      companyId,
      id: documentId,
      loadedAt: new Date('2026-11-06T08:00:00.000Z'),
      nfeDocumentId,
      separatedAt: new Date('2026-11-06T07:00:00.000Z'),
      separationStatus: 'loaded',
      stopId,
      tripId,
    })
    seeded.push({ ...stop, documentId, stopId })
  }
  const [first, second, third] = seeded
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('seed failed')
  }
  return { companyId, driverId, membershipId, stops: [first, second, third], tripId, userId }
}

async function seedNfeDocument(
  db: JourneyDatabase,
  input: {
    readonly client: string
    readonly companyId: string
    readonly emitterTaxId: string
    readonly number: string
    readonly userId: string
    readonly value: string
    readonly volumes: string
  },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.number.padStart(64, '7')
  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/journey-${input.number}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `journey-${input.number}`,
    id: importId,
    idempotencyKey: `journey-${input.number}`,
    requestFingerprint: `journey-${input.number}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await db.insert(nfeDocuments).values({
    accessKey: `3526${input.number.padStart(40, '0')}`,
    authorizationProtocol: `protocol-${input.number}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-11-05T06:00:00.000Z'),
    model: '55',
    number: input.number,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: input.value,
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: input.value,
    xmlObjectId,
    xmlSha256: sha,
  })
  const recipientId = crypto.randomUUID()
  await db.insert(nfeParticipants).values([
    {
      companyId: input.companyId,
      documentId,
      id: recipientId,
      legalName: input.client,
      role: 'recipient',
    },
    {
      companyId: input.companyId,
      documentId,
      legalName: 'AURORA INDUSTRIA LTDA',
      role: 'emitter',
      taxId: input.emitterTaxId,
    },
  ])
  await db.insert(nfeAddresses).values({
    city: 'Ribeirao Preto',
    cityCode: '3543402',
    companyId: input.companyId,
    number: '100',
    participantId: recipientId,
    postalCode: '14000000',
    state: 'SP',
    street: 'Rua Jornada',
  })
  await db.insert(nfeVolumes).values({
    companyId: input.companyId,
    documentId,
    ordinal: 1n,
    quantity: input.volumes,
  })
  return documentId
}

/** Os eventos gravados da viagem, na ordem: parada (sequência), tipo e se foi marcado junto. */
export async function readJourneyEvents(
  db: JourneyDatabase,
  world: JourneyWorld,
): Promise<readonly string[]> {
  const rows = await db
    .select({
      createdAt: tripStopEvents.createdAt,
      kind: tripStopEvents.kind,
      latitude: tripStopEvents.latitude,
      recordedTogether: tripStopEvents.recordedTogether,
      sequence: tripStops.sequence,
    })
    .from(tripStopEvents)
    .innerJoin(tripStops, eq(tripStops.id, tripStopEvents.stopId))
    .where(eq(tripStops.tripId, world.tripId))
    .orderBy(asc(tripStopEvents.createdAt))
  return rows.map(
    (row) =>
      `parada ${row.sequence}: ${row.kind}${row.recordedTogether ? ' (marcado junto)' : ''}${
        row.latitude === null ? '' : ' 📍'
      }`,
  )
}

/** Uma conversa gravada: quem falou e o quê, para conferir texto a texto e imprimir no PR. */
export type JourneyLine = { readonly from: 'bot' | 'motorista'; readonly text: string }

export function formatJourneyTranscript(lines: readonly JourneyLine[]): string {
  return lines
    .map((line) => `${line.from === 'bot' ? '🤖 bot' : '👤 motorista'}:\n${line.text}`)
    .join('\n\n')
}

/** Toda fala do bot sai com a marcação do WhatsApp fechada (nada de "** na *NF *"). */
export function expectBalancedMarkup(lines: readonly JourneyLine[]): string[] {
  return lines
    .filter((line) => line.from === 'bot')
    .flatMap((line) => findWhatsAppMarkupProblems(line.text))
}
