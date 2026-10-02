/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O grafo mínimo que a fila de canhotos atravessa — empresa, viagem, nota, parada, evento, objeto e
 * comprovante —, semeado por SQL contra o Postgres de integração. `trip_delivery_proofs` não tem
 * `trip_id` nem `document_id`: eles só existem nos joins, e é isso que este fixture reproduz.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export const CANHOTO_GRAPH_BUCKET = 'canhoto-integration'

export type SeedCanhotoProofInput = Readonly<{
  accessKey: string
  createdAt: string
  mimeType?: string
  noteNumber: string
  noteSeries: string
  objectKey?: string
  sizeBytes?: number
}>

export type SeededCanhotoProof = Readonly<{
  documentId: string
  nfeDocumentId: string
  objectId: string
  objectKey: string
  proofId: string
  stopEventId: string
}>

export type CanhotoGraph = Readonly<{
  cleanup: () => Promise<void>
  companyId: string
  seedProof: (input: SeedCanhotoProofInput) => Promise<SeededCanhotoProof>
  tripId: string
}>

export async function createCanhotoGraph(database: Database): Promise<CanhotoGraph> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
  await database.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
  await database.execute(sql`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
  `)
  await database.execute(sql`
    insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
    values (${vehicleId}, ${companyId}, 'GCQ8E47', 'traction', 'tractor_unit', 'SP')
  `)
  await database.execute(sql`
    insert into trips (id, company_id, vehicle_id, status)
    values (${tripId}, ${companyId}, ${vehicleId}, 'on_delivery_route')
  `)
  await database.execute(sql`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 1, '3550308|01001000|100', 'Centro, 100')
  `)
  await insertStoredObject({
    bucket: CANHOTO_GRAPH_BUCKET,
    companyId,
    database,
    mimeType: 'application/xml',
    objectId: xmlObjectId,
    objectKey: `xml/${xmlObjectId}.xml`,
    purpose: 'nfe_document',
    sizeBytes: 100,
  })
  await database.execute(sql`
    insert into nfe_imports
      (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
       request_fingerprint, status)
    values (${importId}, ${companyId}, 'upload', ${userId}, ${`corr-${importId}`},
      ${`idem-${importId}`}, ${importId.replaceAll('-', '').padEnd(64, '0')}, 'completed')
  `)

  async function seedProof(input: SeedCanhotoProofInput): Promise<SeededCanhotoProof> {
    const nfeDocumentId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const stopEventId = crypto.randomUUID()
    const proofId = crypto.randomUUID()
    const objectId = crypto.randomUUID()
    const objectKey = input.objectKey ?? `proof/${objectId}.jpg`

    await database.execute(sql`
      insert into nfe_documents
        (id, company_id, access_key, model, number, series, issued_at, operation_nature,
         operation_type, status, authorization_protocol, source, total_value, products_value,
         xml_object_id, xml_sha256, import_id, created_by_user_id)
      values (${nfeDocumentId}, ${companyId}, ${input.accessKey}, '55', ${input.noteNumber},
        ${input.noteSeries}, ${input.createdAt}, 'Venda', '1', 'authorized', '135240000000001',
        'upload', 10, 10, ${xmlObjectId}, ${xmlObjectId.replaceAll('-', '').padEnd(64, '0')},
        ${importId}, ${userId})
    `)
    await database.execute(sql`
      insert into trip_documents (id, company_id, trip_id, nfe_document_id)
      values (${documentId}, ${companyId}, ${tripId}, ${nfeDocumentId})
    `)
    await database.execute(sql`
      insert into trip_stop_events
        (id, company_id, stop_id, trip_document_id, kind, actor_user_id, created_at)
      values (${stopEventId}, ${companyId}, ${stopId}, ${documentId}, 'delivered', ${userId},
        ${input.createdAt})
    `)
    await insertStoredObject({
      bucket: CANHOTO_GRAPH_BUCKET,
      companyId,
      database,
      mimeType: input.mimeType ?? 'image/jpeg',
      objectId,
      objectKey,
      purpose: 'delivery_proof',
      sizeBytes: input.sizeBytes ?? 100,
    })
    await database.execute(sql`
      insert into trip_delivery_proofs
        (id, company_id, stop_event_id, kind, object_id, actor_user_id, canhoto_review,
         created_at)
      values (${proofId}, ${companyId}, ${stopEventId}, 'photo', ${objectId}, ${userId},
        'pending', ${input.createdAt})
    `)
    return { documentId, nfeDocumentId, objectId, objectKey, proofId, stopEventId }
  }

  async function cleanup(): Promise<void> {
    await database.execute(sql`delete from trip_delivery_proofs where company_id = ${companyId}`)
    await database.execute(sql`delete from trip_stop_events where company_id = ${companyId}`)
    await database.execute(sql`delete from trip_documents where company_id = ${companyId}`)
    await database.execute(sql`delete from nfe_documents where company_id = ${companyId}`)
    await database.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
    await database.execute(sql`delete from stored_objects where company_id = ${companyId}`)
    await database.execute(sql`delete from trip_stops where company_id = ${companyId}`)
    await database.execute(sql`delete from trips where company_id = ${companyId}`)
    await database.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await database.execute(
      sql`delete from user_company_memberships where company_id = ${companyId}`,
    )
    await database.execute(sql`delete from identity_users where id = ${userId}`)
    await database.execute(sql`delete from companies where id = ${companyId}`)
  }

  return { cleanup, companyId, seedProof, tripId }
}

async function insertStoredObject(
  input: Readonly<{
    bucket: string
    companyId: string
    database: Database
    mimeType: string
    objectId: string
    objectKey: string
    purpose: string
    sizeBytes: number
  }>,
): Promise<void> {
  await input.database.execute(sql`
    insert into stored_objects
      (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes,
       status)
    values (${input.objectId}, ${input.companyId}, ${input.bucket}, ${input.objectKey}, 's3',
      ${input.purpose}, ${input.mimeType}, ${input.objectId.replaceAll('-', '').padEnd(64, '0')},
      ${input.sizeBytes}, 'final')
  `)
}
