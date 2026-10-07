/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2d: o que a integração do prazo de entrega semeia — notas com destino, uma viagem com
 * elas, chegadas, entregas e desvios. Semeadura em lote e em série: dezenas de INSERTs concorrentes no
 * pool já derrubaram teste de integração aqui. Dados inventados.
 */
import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../src/database/nfe.schema.js'
import {
  cargoArrivalDocuments,
  cargoArrivals,
  deliveryAddressOverrides,
  nfeImports,
  storedObjects,
  tripDocuments,
  tripStopEvents,
  tripStops,
  trips,
  municipalHolidays,
} from '../../src/database/database.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { COMPANY_CONTEXT } from './freight-region-http.fixture.js'
import {
  ISSUER_TAX_ID,
  SAO_CARLOS,
  type CargoTenants,
  type TestDatabase,
} from './cargo-arrival-database.fixture.js'

/** Terça-feira 13/10/2026 12:00 em São Paulo. */
export const ARRIVED_TUESDAY = new Date('2026-10-13T15:00:00.000Z')
/** Quarta-feira 14/10/2026 12:00 em São Paulo. */
export const WEDNESDAY_NOON = new Date('2026-10-14T15:00:00.000Z')
export const CAMPINAS = '3509502'
export const ACTOR_USER_ID = COMPANY_CONTEXT.userId

let documentCounter = 0

export type SeedNotesParams = {
  readonly cityCodes?: readonly string[]
  readonly companyId: string
  readonly count: number
  readonly emitterTaxId: string
}

/** Notas autorizadas, cada uma com emitente e destinatário; a cidade do destinatário gira pela lista. */
export async function seedNotes(
  database: TestDatabase,
  params: SeedNotesParams,
): Promise<readonly string[]> {
  const { companyId } = params
  const cityCodes = params.cityCodes ?? [SAO_CARLOS]
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = 'b'.repeat(64)
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/deadline-${xmlObjectId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${importId}`,
    id: importId,
    idempotencyKey: `deadline-${importId}`,
    requestFingerprint: `fingerprint-${importId}`,
    requestedByUserId: ACTOR_USER_ID,
    source: 'upload',
    status: 'completed',
  })
  const notes = Array.from({ length: params.count }, (_, index) => {
    documentCounter += 1
    return {
      cityCode: cityCodes[index % cityCodes.length] ?? SAO_CARLOS,
      documentId: crypto.randomUUID(),
      number: String(documentCounter),
      recipientId: crypto.randomUUID(),
    }
  })
  await database.db.insert(nfeDocuments).values(
    notes.map((note) => ({
      accessKey: `9${note.number.padStart(43, '0')}`,
      authorizationProtocol: `protocol-${note.number}`,
      companyId,
      createdByUserId: ACTOR_USER_ID,
      id: note.documentId,
      importId,
      issuedAt: new Date('2026-10-02T22:00:00.000Z'),
      model: '55',
      number: note.number,
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload' as const,
      status: 'authorized' as const,
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: sha,
    })),
  )
  await database.db.insert(nfeParticipants).values(
    notes.flatMap((note) => [
      { companyId, documentId: note.documentId, role: 'emitter', taxId: params.emitterTaxId },
      {
        companyId,
        documentId: note.documentId,
        id: note.recipientId,
        legalName: 'Destinatário Teste',
        role: 'recipient',
      },
    ]),
  )
  await database.db.insert(nfeAddresses).values(
    notes.map((note) => ({
      city: 'Cidade Teste',
      cityCode: note.cityCode,
      companyId,
      participantId: note.recipientId,
      state: 'SP',
    })),
  )
  return notes.map((note) => note.documentId)
}

export type SeededTripNotes = {
  readonly stopId: string
  readonly tripDocumentIds: ReadonlyMap<string, string>
  readonly tripId: string
}

/** Uma viagem com uma parada que leva todas as notas (`nfe_document_id` → `trip_documents.id`). */
export async function seedTripWithNotes(
  database: TestDatabase,
  params: { readonly companyId: string; readonly documentIds: readonly string[] },
): Promise<SeededTripNotes> {
  const { companyId } = params
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  await database.db.insert(trips).values({ companyId, id: tripId })
  await database.db.insert(tripStops).values({
    addressKey: `deadline|${tripId}`,
    companyId,
    id: stopId,
    label: 'Parada do prazo',
    sequence: 1n,
    tripId,
  })
  const rows = params.documentIds.map((nfeDocumentId) => ({
    companyId,
    id: crypto.randomUUID(),
    nfeDocumentId,
    stopId,
    tripId,
  }))
  await database.db.insert(tripDocuments).values(rows)
  return {
    stopId,
    tripDocumentIds: new Map(rows.map((row) => [row.nfeDocumentId, row.id])),
    tripId,
  }
}

export type SeedArrivalParams = {
  readonly arrivedAt: Date
  readonly companyId: string
  readonly contractorId: string
  readonly deadlineBusinessDays: number
  readonly documentIds: readonly string[]
}

export async function seedArrival(
  database: TestDatabase,
  params: SeedArrivalParams,
): Promise<string> {
  const { companyId } = params
  const arrivalId = crypto.randomUUID()
  await database.db.insert(cargoArrivals).values({
    arrivedAt: params.arrivedAt,
    channel: 'backoffice',
    companyId,
    contractorId: params.contractorId,
    deliveryDeadlineBusinessDays: params.deadlineBusinessDays,
    id: arrivalId,
    idempotencyKey: `arrival-${arrivalId}`,
    registeredByUserId: ACTOR_USER_ID,
    requestFingerprint: 'a'.repeat(64),
  })
  await database.db
    .insert(cargoArrivalDocuments)
    .values(params.documentIds.map((nfeDocumentId) => ({ arrivalId, companyId, nfeDocumentId })))
  return arrivalId
}

export async function seedDeliveredEvent(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly occurredAt: Date | null
    readonly recordedAt: Date
    readonly stopId: string
    readonly tripDocumentId: string
  },
): Promise<void> {
  await database.db.insert(tripStopEvents).values({
    actorUserId: ACTOR_USER_ID,
    companyId: params.companyId,
    createdAt: params.recordedAt,
    kind: 'delivered',
    occurredAt: params.occurredAt,
    recordedAt: params.recordedAt,
    stopId: params.stopId,
    tripDocumentId: params.tripDocumentId,
  })
}

export async function seedAddressOverride(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly newCityCode: string | null
    readonly tripDocumentId: string
  },
): Promise<void> {
  await database.db.insert(deliveryAddressOverrides).values({
    actorUserId: ACTOR_USER_ID,
    companyId: params.companyId,
    newCityCode: params.newCityCode,
    newLabel: 'Novo endereço',
    previousLabel: 'Endereço antigo',
    reason: 'teste',
    requestedBy: 'teste',
    tripDocumentId: params.tripDocumentId,
  })
}

export async function seedTypedHoliday(
  database: TestDatabase,
  params: { readonly cityIbgeCode: string; readonly companyId: string; readonly holidayOn: string },
): Promise<void> {
  await database.db.insert(municipalHolidays).values({
    cityIbgeCode: params.cityIbgeCode,
    companyId: params.companyId,
    holidayOn: params.holidayOn,
    name: 'Feriado digitado',
  })
}

/** O detalhe da viagem com o "hoje" injetado: o prazo de cada nota, pelo `nfe_document_id`. */
export async function readDeadlines(
  database: TestDatabase,
  params: { readonly companyId: string; readonly now: Date; readonly tripId: string },
) {
  const repository = new DrizzleTripRepository(database.db, undefined, {
    clock: { now: () => params.now },
  })
  const detail = await repository.findById({ companyId: params.companyId, tripId: params.tripId })
  return new Map(detail?.documents.map((document) => [document.nfeDocumentId, document]))
}

/** Uma nota do contratante com perfil, chegada na terça (3 dias úteis: vence na sexta 16/10), numa viagem. */
export async function seedArrivedNote(database: TestDatabase, tenants: CargoTenants) {
  const companyId = COMPANY_CONTEXT.companyId
  const [documentId] = await seedNotes(database, {
    companyId,
    count: 1,
    emitterTaxId: ISSUER_TAX_ID,
  })
  if (documentId === undefined) throw new Error('EXPECTED_NOTE')
  const trip = await seedTripWithNotes(database, { companyId, documentIds: [documentId] })
  await seedArrival(database, {
    arrivedAt: ARRIVED_TUESDAY,
    companyId,
    contractorId: tenants.contractorId,
    deadlineBusinessDays: 3,
    documentIds: [documentId],
  })
  return { documentId, tripDocumentId: trip.tripDocumentIds.get(documentId) ?? '', trip }
}
