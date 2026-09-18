import { SQL } from 'bun'
import { expect } from 'bun:test'

import type { FleetFixture } from './fleet-constraints.assertion.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'
import { assertTripDocumentReviewConstraints } from './trip-document-review-constraints.assertion.js'

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

  // Spec 153 D4: a rota nasce inteira numa escrita — meia gravação é proibida, uma coluna por vez.
  await expectQueryToFail(
    database`
      update trips
      set planned_route = '{}'::jsonb
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_check',
  )
  await expectQueryToFail(
    database`
      update trips
      set planned_route_frozen_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_check',
  )
  await expectQueryToFail(
    database`
      update trips
      set planned_route = '{}'::jsonb, planned_distance_meters = 12000,
          planned_return_distance_meters = 0, planned_route_frozen_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_check',
  )
  // Casos extremos: `end_policy = 'last_stop'` grava volta zero, nunca nula — 0 é valor legal.
  await database`
    update trips
    set planned_route = '{}'::jsonb, planned_distance_meters = 12000,
        planned_return_distance_meters = 0, planned_duration_seconds = 3600,
        planned_route_frozen_at = now()
    where id = ${tripId}
  `
  await database`
    update trips
    set planned_route = null, planned_distance_meters = null,
        planned_return_distance_meters = null, planned_duration_seconds = null,
        planned_route_frozen_at = null
    where id = ${tripId}
  `
  await expectQueryToFail(
    database`
      update trips
      set planned_route = '{}'::jsonb, planned_distance_meters = -1,
          planned_return_distance_meters = 0, planned_duration_seconds = 3600,
          planned_route_frozen_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_metrics_check',
  )
  await expectQueryToFail(
    database`
      update trips
      set planned_route = '{}'::jsonb, planned_distance_meters = 12000,
          planned_return_distance_meters = -1, planned_duration_seconds = 3600,
          planned_route_frozen_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_metrics_check',
  )
  await expectQueryToFail(
    database`
      update trips
      set planned_route = '{}'::jsonb, planned_distance_meters = 12000,
          planned_return_distance_meters = 0, planned_duration_seconds = -1,
          planned_route_frozen_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_planned_route_metrics_check',
  )

  // Spec 143 D4: meia diária está fora do escopo, e viagem de zero dia não existe — o piso é 1.
  await database`
    insert into trips (company_id, vehicle_id, daily_allowance_days)
    values (${companyId}, ${vehicleId}, 3)
  `
  await expectQueryToFail(
    database`
      insert into trips (company_id, vehicle_id, daily_allowance_days)
      values (${companyId}, ${vehicleId}, 0)
    `,
    '23514',
    'trips_daily_allowance_days_check',
  )

  // Spec 143 D3: uma linha de valor geral por empresa, e ela não aceita diária zerada.
  await database`
    insert into company_driver_allowance_settings (company_id, daily_allowance_amount, updated_by_user_id)
    values (${companyId}, 180.0000, ${userId})
  `
  await expectQueryToFail(
    database`
      insert into company_driver_allowance_settings (company_id, daily_allowance_amount, updated_by_user_id)
      values (${companyId}, 200.0000, ${userId})
    `,
    '23505',
    'company_driver_allowance_settings_pkey',
  )
  await expectQueryToFail(
    database`
      insert into company_driver_allowance_settings (company_id, daily_allowance_amount, updated_by_user_id)
      values (${otherCompanyId}, 0, ${userId})
    `,
    '23514',
    'company_driver_allowance_settings_amount_check',
  )

  // Spec 065 D4c: motivo so existe para a dispensa, e sobrescrita sem autor nao conta quem assinou.
  await expectQueryToFail(
    database`
      update trips
      set requires_mdfe = true, requires_mdfe_reason = 'sem sentido',
          requires_mdfe_actor_user_id = ${userId}, requires_mdfe_set_at = now()
      where id = ${tripId}
    `,
    '23514',
    'trips_requires_mdfe_reason_check',
  )
  await expectQueryToFail(
    database`update trips set requires_mdfe = true where id = ${tripId}`,
    '23514',
    'trips_requires_mdfe_trail_check',
  )
  await database`
    update trips
    set requires_mdfe = false, requires_mdfe_reason = 'frota propria',
        requires_mdfe_actor_user_id = ${userId}, requires_mdfe_set_at = now()
    where id = ${tripId}
  `
  await database`
    update trips
    set requires_mdfe = null, requires_mdfe_reason = null,
        requires_mdfe_actor_user_id = null, requires_mdfe_set_at = null
    where id = ${tripId}
  `

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

  await assertTripDocumentReviewConstraints({
    companyId,
    database,
    nfeDocumentId: liveNfeDocumentId,
    tripDocumentId: liveTripDocumentId,
    tripId,
    userId,
  })

  await assertLiveManifestConstraint({ companyId, database, tripId, vehicleId })

  await assertFieldExecutionConstraints({
    companyId,
    database,
    driverId,
    otherCompanyId,
    tripDocumentId: liveTripDocumentId,
    tripId,
    userId,
  })
}

/**
 * ADR-0046 §5: **um manifesto vivo por viagem**. Duas autorizações de CT-e chegando no mesmo instante
 * disparariam duas emissões, e duplicar MDF-e é incidente fiscal — quem perde a corrida é o `if` no
 * consumer, então quem decide é o banco.
 *
 * Cancelado e rejeitado ficam de fora do unique de propósito: depois deles a viagem **precisa** poder
 * manifestar de novo, e é justamente o caso em que alguém está com pressa.
 */
async function assertLiveManifestConstraint(input: {
  readonly companyId: string
  readonly database: SQL
  readonly tripId: string
  readonly vehicleId: string
}): Promise<void> {
  const { companyId, database, tripId, vehicleId } = input
  const liveManifestId = crypto.randomUUID()

  await database`
    insert into mdfe_manifests
      (id, company_id, vehicle_id, trip_id, status, fiscal_environment, origin_state, destination_state)
    values
      (${liveManifestId}, ${companyId}, ${vehicleId}, ${tripId}, 'issuing', 'homologation', 'SP', 'MG')
  `

  await expectQueryToFail(
    database`
      insert into mdfe_manifests
        (company_id, vehicle_id, trip_id, status, fiscal_environment, origin_state, destination_state)
      values
        (${companyId}, ${vehicleId}, ${tripId}, 'draft', 'homologation', 'SP', 'MG')
    `,
    '23505',
    'mdfe_manifests_company_trip_live_unique',
  )

  // Rejeitado sai da trava: a viagem precisa poder manifestar de novo depois de a SEFAZ recusar
  await database`update mdfe_manifests set status = 'rejected' where id = ${liveManifestId}`
  await database`
    insert into mdfe_manifests
      (company_id, vehicle_id, trip_id, status, fiscal_environment, origin_state, destination_state)
    values
      (${companyId}, ${vehicleId}, ${tripId}, 'draft', 'homologation', 'SP', 'MG')
  `
  await database`delete from mdfe_manifests where trip_id = ${tripId}`
}

/**
 * Spec 057: os invariantes que o banco guarda porque o caso de uso pode esquecer. Coordenada meia —
 * latitude sem longitude, ou precisão sem coordenada — é dado que mente, e mentir sobre onde a
 * entrega aconteceu é pior do que não saber.
 */
async function assertFieldExecutionConstraints(input: {
  readonly companyId: string
  readonly database: SQL
  readonly driverId: string
  readonly otherCompanyId: string
  readonly tripDocumentId: string
  readonly tripId: string
  readonly userId: string
}): Promise<void> {
  const { companyId, database, driverId, otherCompanyId, tripDocumentId, tripId, userId } = input
  const stopId = crypto.randomUUID()

  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 1, '3550308|01001000|100', 'Centro, 100')
  `

  // A recusa de GPS não bloqueia: a entrega entra sem coordenada nenhuma, e isso é o caso normal
  await database`
    insert into trip_stop_events (company_id, stop_id, trip_document_id, kind, actor_user_id)
    values (${companyId}, ${stopId}, ${tripDocumentId}, 'delivered', ${userId})
  `

  // Precisão de 5 km é gravada com o número, nunca descartada: galpão de laje é o caso normal
  await database`
    insert into trip_stop_events (
      company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at, actor_user_id
    )
    values (
      ${companyId}, ${stopId}, 'arrived', '-23.5505199', '-46.6333094', '5000.00', now(), ${userId}
    )
  `

  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, latitude, actor_user_id)
      values (${companyId}, ${stopId}, 'arrived', '-23.5505199', ${userId})
    `,
    '23514',
    'trip_stop_events_coordinates_check',
  )

  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, accuracy_meters, actor_user_id)
      values (${companyId}, ${stopId}, 'arrived', '12.00', ${userId})
    `,
    '23514',
    'trip_stop_events_accuracy_check',
  )

  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, actor_user_id)
      values (${companyId}, ${stopId}, 'chegou', ${userId})
    `,
    '23514',
    'trip_stop_events_kind_check',
  )

  // A ocorrência não precisa de nota: o problema aconteceu na parada, com ou sem entrega
  await database`
    insert into trip_stop_occurrences (company_id, stop_id, kind, description, actor_user_id)
    values (${companyId}, ${stopId}, 'long_wait', 'Duas horas na fila da doca', ${userId})
  `

  await expectQueryToFail(
    database`
      insert into trip_stop_occurrences (company_id, stop_id, kind, actor_user_id)
      values (${companyId}, ${stopId}, 'cobranca', ${userId})
    `,
    '23514',
    'trip_stop_occurrences_kind_check',
  )

  // O reenvio da fila offline bate aqui, e é aqui que ele para de virar entrega duplicada
  await database`
    insert into trip_field_reports (company_id, idempotency_key, operation, actor_user_id)
    values (${companyId}, 'chave-do-aparelho', 'deliver', ${userId})
  `
  await expectQueryToFail(
    database`
      insert into trip_field_reports (company_id, idempotency_key, operation, actor_user_id)
      values (${companyId}, 'chave-do-aparelho', 'deliver', ${userId})
    `,
    '23505',
    'trip_field_reports_company_key_unique',
  )

  await assertFieldChannelConstraints({
    companyId,
    database,
    driverId,
    otherCompanyId,
    stopId,
    tripDocumentId,
    userId,
  })

  // A parada apagada leva o que aconteceu nela; o que não pode é sobrar evento órfão
  await database`delete from trip_stops where id = ${stopId}`
  const orphanEvents = await database<
    Array<{ readonly events: string; readonly occurrences: string }>
  >`
    select
      (select count(*) from trip_stop_events where stop_id = ${stopId}) as events,
      (select count(*) from trip_stop_occurrences where stop_id = ${stopId}) as occurrences
  `
  expect(orphanEvents[0]).toEqual({ events: '0', occurrences: '0' })
}

/**
 * ADR-0067 §2 (spec 156 T4): a autoria do registro de campo — canal, e o motorista em nome de quem
 * o escritório registrou. As seis tabelas repetem o mesmo par de `check`s; aqui a prova cobre as
 * três formas que os nomes tomam (`trip_stop_events` com `recorded_at`, `trip_document_occurrences`
 * sem ela, `trip_field_reports` como a chave de idempotência) e a FK composta uma vez, porque o
 * `(company_id, on_behalf_of_driver_id) -> fleet_drivers` é idêntico nas seis.
 */
async function assertFieldChannelConstraints(input: {
  readonly companyId: string
  readonly database: SQL
  readonly driverId: string
  readonly otherCompanyId: string
  readonly stopId: string
  readonly tripDocumentId: string
  readonly userId: string
}): Promise<void> {
  const { companyId, database, driverId, otherCompanyId, stopId, tripDocumentId, userId } = input
  const otherCompanyDriverId = crypto.randomUUID()

  await database`
    insert into fleet_drivers (id, company_id, name, tax_id)
    values (${otherCompanyDriverId}, ${otherCompanyId}, 'Motorista De Outra Empresa', '22233344455')
  `

  // Canal fora da lista fechada, nas três formas de tabela (com e sem `recorded_at`).
  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, actor_user_id, channel)
      values (${companyId}, ${stopId}, 'arrived', ${userId}, 'fax')
    `,
    '23514',
    'trip_stop_events_channel_check',
  )
  await expectQueryToFail(
    database`
      insert into trip_field_reports (company_id, idempotency_key, operation, actor_user_id, channel)
      values (${companyId}, 'canal-invalido', 'deliver', ${userId}, 'fax')
    `,
    '23514',
    'trip_field_reports_channel_check',
  )

  // `channel = 'office'` sem `on_behalf_of_driver_id` — o CHECK de implicação (ADR-0067 §2).
  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, actor_user_id, channel)
      values (${companyId}, ${stopId}, 'arrived', ${userId}, 'office')
    `,
    '23514',
    'trip_stop_events_office_driver_check',
  )
  await expectQueryToFail(
    database`
      insert into trip_document_occurrences (
        company_id, trip_document_id, stage, occurrence_type_id, actor_user_id, channel
      )
      values (
        ${companyId}, ${tripDocumentId}, 'delivery', ${crypto.randomUUID()}, ${userId}, 'office'
      )
    `,
    '23514',
    'trip_document_occurrences_office_driver_check',
  )

  // FK composta: o motorista em nome de quem se registra nunca é de outra empresa (mesma empresa
  // do evento) — reprovada mesmo com `channel = 'office'` satisfeito por um id que existe, só que
  // no tenant errado.
  await expectQueryToFail(
    database`
      insert into trip_stop_events (
        company_id, stop_id, kind, actor_user_id, channel, on_behalf_of_driver_id
      )
      values (${companyId}, ${stopId}, 'arrived', ${userId}, 'office', ${otherCompanyDriverId})
    `,
    '23503',
    'trip_stop_events_company_driver_fk',
  )
  await expectQueryToFail(
    database`
      insert into trip_field_reports (
        company_id, idempotency_key, operation, actor_user_id, channel, on_behalf_of_driver_id
      )
      values (
        ${companyId}, 'chave-fk-outra-empresa', 'deliver', ${userId}, 'office', ${otherCompanyDriverId}
      )
    `,
    '23503',
    'trip_field_reports_company_driver_fk',
  )

  // O caminho feliz: canal `office` com o motorista da própria empresa grava normalmente.
  const [officeEvent] = await database<Array<{ readonly id: string }>>`
    insert into trip_stop_events (
      company_id, stop_id, kind, actor_user_id, channel, on_behalf_of_driver_id
    )
    values (${companyId}, ${stopId}, 'arrived', ${userId}, 'office', ${driverId})
    returning id
  `
  expect(officeEvent?.id).toBeDefined()
}
