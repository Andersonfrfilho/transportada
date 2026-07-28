import { SQL } from 'bun'
import { expect } from 'bun:test'

import type { FleetFixture } from './fleet-constraints.assertion.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

export async function assertMdfeConstraints(
  database: SQL,
  identity: IdentityFixture,
  fleet: FleetFixture,
): Promise<void> {
  const { companyId } = identity
  const { otherCompanyId, vehicleId, driverId, secondDriverId } = fleet
  const manifestId = crypto.randomUUID()
  const authorizedManifestId = crypto.randomUUID()

  await database`
    insert into mdfe_manifests (id, company_id, vehicle_id, fiscal_environment, origin_state, destination_state)
    values (${manifestId}, ${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG')
  `

  await expectQueryToFail(
    database`
      insert into mdfe_manifests (company_id, vehicle_id, fiscal_environment, origin_state, destination_state)
      values (${otherCompanyId}, ${vehicleId}, 'homologation', 'SP', 'MG')
    `,
    '23503',
    'mdfe_manifests_company_vehicle_fk',
  )
  await expectQueryToFail(
    database`
      insert into mdfe_manifests (company_id, vehicle_id, fiscal_environment, origin_state, destination_state)
      values (${companyId}, ${vehicleId}, 'homologation', 'sp', 'MG')
    `,
    '23514',
    'mdfe_manifests_state_check',
  )
  await expectQueryToFail(
    database`
      insert into mdfe_manifests (company_id, vehicle_id, fiscal_environment, origin_state, destination_state, status)
      values (${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG', 'authorized')
    `,
    '23514',
    'mdfe_manifests_issued_state_check',
  )

  await database`
    insert into mdfe_manifests (
      id, company_id, vehicle_id, fiscal_environment, origin_state, destination_state,
      status, fiscal_series, fiscal_number
    )
    values (
      ${authorizedManifestId}, ${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG',
      'authorized', '1', 4001
    )
  `
  await expectQueryToFail(
    database`
      insert into mdfe_manifests (
        company_id, vehicle_id, fiscal_environment, origin_state, destination_state,
        status, fiscal_series, fiscal_number
      )
      values (
        ${companyId}, ${vehicleId}, 'homologation', 'SP', 'MG',
        'authorized', '1', 4001
      )
    `,
    '23505',
    'mdfe_manifests_company_environment_series_number_unique',
  )
  await database`
    insert into mdfe_manifests (
      company_id, vehicle_id, fiscal_environment, origin_state, destination_state,
      status, fiscal_series, fiscal_number
    )
    values (
      ${companyId}, ${vehicleId}, 'production', 'SP', 'MG',
      'authorized', '1', 4001
    )
  `

  await database`
    insert into mdfe_manifest_drivers (company_id, manifest_id, driver_id, driver_name, driver_tax_id, position)
    values (${companyId}, ${manifestId}, ${driverId}, 'Motorista Titular', '12345678901', 1)
  `
  await expectQueryToFail(
    database`
      insert into mdfe_manifest_drivers (company_id, manifest_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${manifestId}, ${driverId}, 'Motorista Titular', '12345678901', 2)
    `,
    '23505',
    'mdfe_manifest_drivers_company_manifest_driver_unique',
  )
  await expectQueryToFail(
    database`
      insert into mdfe_manifest_drivers (company_id, manifest_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${manifestId}, ${secondDriverId}, 'Motorista Reserva', '98765432100', 1)
    `,
    '23505',
    'mdfe_manifest_drivers_company_manifest_position_unique',
  )
  await expectQueryToFail(
    database`
      insert into mdfe_manifest_drivers (company_id, manifest_id, driver_id, driver_name, driver_tax_id, position)
      values (${companyId}, ${manifestId}, ${secondDriverId}, 'Motorista Reserva', '98765432100', 11)
    `,
    '23514',
    'mdfe_manifest_drivers_position_check',
  )

  await database`
    insert into mdfe_manifest_loading_cities (company_id, manifest_id, city_code, city_name, position)
    values (${companyId}, ${manifestId}, '3550308', 'Sao Paulo', 1)
  `
  await expectQueryToFail(
    database`
      insert into mdfe_manifest_loading_cities (company_id, manifest_id, city_code, city_name, position)
      values (${companyId}, ${manifestId}, '355030', 'Sao Paulo', 2)
    `,
    '23514',
    'mdfe_manifest_loading_cities_city_code_check',
  )

  await expectQueryToFail(
    database`
      insert into mdfe_issuance_attempts (
        company_id, manifest_id, attempt_kind, attempt_number, status,
        idempotency_key, idempotency_fingerprint, request_fingerprint,
        fiscal_environment, correlation_id
      )
      values (
        ${companyId}, ${manifestId}, 'issue', 1, 'pending',
        'idem-mdfe-1', 'fingerprint-1', 'request-1',
        'homologation', 'correlation-1'
      )
    `,
    '23514',
    'mdfe_issuance_attempts_reservation_check',
  )
  await database`
    insert into mdfe_issuance_attempts (
      company_id, manifest_id, attempt_kind, attempt_number, status,
      idempotency_key, idempotency_fingerprint, request_fingerprint,
      fiscal_environment, correlation_id
    )
    values (
      ${companyId}, ${authorizedManifestId}, 'close', 1, 'pending',
      'idem-mdfe-2', 'fingerprint-2', 'request-2',
      'homologation', 'correlation-2'
    )
  `

  await database`delete from mdfe_manifests where id = ${manifestId}`
  const orphans = await database<Array<{ readonly drivers: string; readonly cities: string }>>`
    select
      (select count(*) from mdfe_manifest_drivers where manifest_id = ${manifestId}) as drivers,
      (select count(*) from mdfe_manifest_loading_cities where manifest_id = ${manifestId}) as cities
  `
  expect(orphans[0]).toEqual({ drivers: '0', cities: '0' })
}
