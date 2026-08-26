import { SQL } from 'bun'
import { expect } from 'bun:test'

import type { FleetFixture } from './fleet-constraints.assertion.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

const ZERO_SHA256 = '0'.repeat(64)

async function insertNfeDocument(
  database: SQL,
  input: {
    readonly companyId: string
    readonly userId: string
    readonly importId: string
    readonly accessKey: string
    readonly objectKey: string
  },
): Promise<string> {
  const { companyId, userId, importId, accessKey, objectKey } = input
  const xmlObjectId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()

  await database`
    insert into stored_objects (
      id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose
    )
    values (
      ${xmlObjectId}, ${companyId}, 's3', 'fiscal', ${objectKey}, 'application/xml', 1024,
      ${ZERO_SHA256}, 'final', 'nfe_document'
    )
  `
  // status 'authorized' com protocolo preenchido — 'unsigned' deixaria a nota presa na guarda de
  // rollback de nfe_documents_status_check (drizzle/20260724115644_unsigned_nfe_document_expand).
  await database`
    insert into nfe_documents (
      id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type,
      status, source, total_value, products_value, authorization_protocol,
      xml_object_id, xml_sha256, import_id, created_by_user_id
    )
    values (
      ${nfeDocumentId}, ${companyId}, ${accessKey}, '55', '1001', '1', now(), 'venda', '1',
      'authorized', 'upload', '1000.00', '1000.00', '135240001',
      ${xmlObjectId}, ${ZERO_SHA256}, ${importId}, ${userId}
    )
  `

  return nfeDocumentId
}

export async function assertTripConstraints(
  database: SQL,
  identity: IdentityFixture,
  fleet: FleetFixture,
): Promise<void> {
  const { companyId, userId } = identity
  const { otherCompanyId, vehicleId, driverId, secondDriverId } = fleet
  const tripId = crypto.randomUUID()
  const otherTripId = crypto.randomUUID()

  await database`
    insert into trips (id, company_id, vehicle_id)
    values (${tripId}, ${companyId}, ${vehicleId})
  `
  await database`
    insert into trips (id, company_id, vehicle_id)
    values (${otherTripId}, ${companyId}, ${vehicleId})
  `

  await expectQueryToFail(
    database`insert into trips (company_id, vehicle_id) values (${otherCompanyId}, ${vehicleId})`,
    '23503',
    'trips_company_vehicle_fk',
  )
  // 'open' era status válido antes do ADR-0042 (trip_status_machine); a lista atual não o inclui mais.
  await expectQueryToFail(
    database`
      insert into trips (company_id, vehicle_id, status)
      values (${companyId}, ${vehicleId}, 'open')
    `,
    '23514',
    'trips_status_check',
  )

  await database`
    insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
    values (${companyId}, ${tripId}, ${driverId}, 'Motorista Titular', '12345678901', 1)
  `
  await expectQueryToFail(
    database`
      insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${tripId}, ${driverId}, 'Motorista Titular', '12345678901', 2)
    `,
    '23505',
    'trip_drivers_company_trip_driver_unique',
  )
  await expectQueryToFail(
    database`
      insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${tripId}, ${secondDriverId}, 'Motorista Reserva', '98765432100', 1)
    `,
    '23505',
    'trip_drivers_company_trip_position_unique',
  )
  await expectQueryToFail(
    database`
      insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${tripId}, ${secondDriverId}, 'Motorista Reserva', '98765432100', 11)
    `,
    '23514',
    'trip_drivers_position_check',
  )
  await expectQueryToFail(
    database`
      insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${tripId}, ${secondDriverId}, 'Motorista Reserva', '987654321', 2)
    `,
    '23514',
    'trip_drivers_tax_id_check',
  )

  const importId = crypto.randomUUID()
  await database`
    insert into nfe_imports (
      id, company_id, source, requested_by_user_id, correlation_id, idempotency_key, request_fingerprint, status
    )
    values (
      ${importId}, ${companyId}, 'upload', ${userId}, 'correlation-trip-fixture',
      'idem-trip-fixture', 'fingerprint-trip-fixture', 'completed'
    )
  `

  const liveNfeDocumentId = await insertNfeDocument(database, {
    companyId,
    userId,
    importId,
    accessKey: '1'.repeat(44),
    objectKey: 'nfe/trip-live.xml',
  })
  const lockedNfeDocumentId = await insertNfeDocument(database, {
    companyId,
    userId,
    importId,
    accessKey: '2'.repeat(44),
    objectKey: 'nfe/trip-locked.xml',
  })

  const liveTripDocumentId = crypto.randomUUID()
  await database`
    insert into trip_documents (id, company_id, trip_id, nfe_document_id)
    values (${liveTripDocumentId}, ${companyId}, ${tripId}, ${liveNfeDocumentId})
  `

  // A nota já vinculada e viva não migra para outra viagem — mesmo padrão de
  // mdfe_manifest_items_live_document_unique / fleet_driver_vehicle_assignments_live_link_unique.
  await expectQueryToFail(
    database`
      insert into trip_documents (company_id, trip_id, nfe_document_id)
      values (${companyId}, ${otherTripId}, ${liveNfeDocumentId})
    `,
    '23505',
    'trip_documents_live_nfe_document_unique',
  )

  await expectQueryToFail(
    database`insert into trip_documents (company_id, trip_id) values (${companyId}, ${tripId})`,
    '23514',
    'trip_documents_entity_xor_check',
  )

  await expectQueryToFail(
    database`
      insert into trip_documents (company_id, trip_id, nfe_document_id, delivered_at, released_at)
      values (${companyId}, ${tripId}, ${lockedNfeDocumentId}, now(), now())
    `,
    '23514',
    'trip_documents_delivered_locks_release_check',
  )

  // Entregue trava o vínculo: uma vez delivered_at preenchido, released_at não pode acompanhar.
  await database`
    update trip_documents set delivered_at = now() where id = ${liveTripDocumentId}
  `
  await expectQueryToFail(
    database`
      update trip_documents set released_at = now() where id = ${liveTripDocumentId}
    `,
    '23514',
    'trip_documents_delivered_locks_release_check',
  )

  await database`
    insert into trip_drivers (company_id, trip_id, driver_id, driver_name, driver_tax_id, position)
    values (${companyId}, ${otherTripId}, ${secondDriverId}, 'Motorista Reserva', '98765432100', 1)
  `
  await database`
    insert into trip_documents (company_id, trip_id, nfe_document_id)
    values (${companyId}, ${otherTripId}, ${lockedNfeDocumentId})
  `

  await database`delete from trips where id = ${otherTripId}`
  const orphans = await database<Array<{ readonly drivers: string; readonly documents: string }>>`
    select
      (select count(*) from trip_drivers where trip_id = ${otherTripId}) as drivers,
      (select count(*) from trip_documents where trip_id = ${otherTripId}) as documents
  `
  expect(orphans[0]).toEqual({ drivers: '0', documents: '0' })
}
