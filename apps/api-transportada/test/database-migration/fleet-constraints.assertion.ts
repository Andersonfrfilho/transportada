import { SQL } from 'bun'

import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

export type FleetFixture = {
  readonly otherCompanyId: string
  readonly vehicleId: string
  readonly trailerId: string
  readonly driverId: string
  readonly secondDriverId: string
}

export async function assertFleetConstraints(
  database: SQL,
  identity: IdentityFixture,
): Promise<FleetFixture> {
  const { companyId, membershipId } = identity
  const otherCompanyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const trailerId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()
  const assignmentId = crypto.randomUUID()

  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  await database`
    insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
    values (${vehicleId}, ${companyId}, 'ABC1D23', 'traction', 'tractor_unit', 'SP')
  `
  await database`
    insert into fleet_vehicles (id, company_id, plate, role, body_type, state)
    values (${trailerId}, ${companyId}, 'XYZ9A88', 'trailer', '01', 'SP')
  `

  await expectQueryToFail(
    database`
      insert into fleet_vehicles (company_id, plate, role, vehicle_type, state)
      values (${companyId}, 'ABC1D23', 'traction', 'tractor_unit', 'SP')
    `,
    '23505',
    'fleet_vehicles_company_id_plate_unique',
  )
  await database`
    insert into fleet_vehicles (company_id, plate, role, vehicle_type, state)
    values (${otherCompanyId}, 'ABC1D23', 'traction', 'tractor_unit', 'SP')
  `

  await expectQueryToFail(
    database`
      insert into fleet_vehicles (company_id, plate, role, vehicle_type, state)
      values (${companyId}, 'QQQ1B11', 'trailer', 'tractor_unit', 'SP')
    `,
    '23514',
    'fleet_vehicles_vehicle_type_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (company_id, plate, role, vehicle_type, state, ownership, owner_tax_id)
      values (${companyId}, 'QQQ1B11', 'traction', 'tractor_unit', 'SP', 'own', '12345678000195')
    `,
    '23514',
    'fleet_vehicles_owner_check',
  )

  // O cadastro aceita o registro como o certificado da ANTT o imprime; nove dígitos sem o zero, não.
  await database`
    insert into fleet_vehicles (
      company_id, plate, role, vehicle_type, state, ownership,
      owner_tax_id, owner_name, owner_state, owner_rntrc, owner_tax_regime
    ) values (
      ${companyId}, 'RNT1A11', 'traction', 'tractor_unit', 'SP', 'third_party',
      '12345678000195', 'Transportes Parceiros', 'SC', '058151044', '0'
    )
  `
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (
        company_id, plate, role, vehicle_type, state, ownership,
        owner_tax_id, owner_name, owner_state, owner_rntrc, owner_tax_regime
      ) values (
        ${companyId}, 'RNT2A22', 'traction', 'tractor_unit', 'SP', 'third_party',
        '12345678000195', 'Transportes Parceiros', 'SC', '581510441', '0'
      )
    `,
    '23514',
    'fleet_vehicles_owner_rntrc_check',
  )

  await database`
    insert into fleet_drivers (id, company_id, membership_id, name, tax_id)
    values (${driverId}, ${companyId}, ${membershipId}, 'Motorista Titular', '12345678901')
  `
  await database`
    insert into fleet_drivers (id, company_id, name, tax_id)
    values (${secondDriverId}, ${companyId}, 'Motorista Sem Login', '98765432100')
  `

  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id)
      values (${companyId}, 'Motorista Repetido', '12345678901')
    `,
    '23505',
    'fleet_drivers_company_id_tax_id_unique',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, membership_id, name, tax_id)
      values (${companyId}, ${membershipId}, 'Motorista Clonado', '11122233344')
    `,
    '23505',
    'fleet_drivers_company_membership_unique',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, membership_id, name, tax_id)
      values (${otherCompanyId}, ${membershipId}, 'Motorista De Outro Tenant', '11122233344')
    `,
    '23503',
    'fleet_drivers_company_membership_fk',
  )

  // A CNH é opcional: os dois motoristas acima entraram sem habilitação e não colidiram
  await database`
    insert into fleet_drivers (company_id, name, tax_id, license_number)
    values (${companyId}, 'Motorista Habilitado', '22233344455', '55566677788')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, license_number)
      values (${companyId}, 'Motorista Com CNH Repetida', '33344455566', '55566677788')
    `,
    '23505',
    'fleet_drivers_company_license_number_unique',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, postal_code)
      values (${companyId}, 'Motorista Com CEP Torto', '44455566677', '1234-567')
    `,
    '23514',
    'fleet_drivers_postal_code_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, birth_date)
      values (${companyId}, 'Motorista Ancestral', '55566677788', '1899-12-31')
    `,
    '23514',
    'fleet_drivers_dates_check',
  )

  await database`
    insert into fleet_driver_vehicle_assignments (id, company_id, driver_id, vehicle_id)
    values (${assignmentId}, ${companyId}, ${driverId}, ${vehicleId})
  `
  await expectQueryToFail(
    database`
      insert into fleet_driver_vehicle_assignments (company_id, driver_id, vehicle_id)
      values (${companyId}, ${driverId}, ${vehicleId})
    `,
    '23505',
    'fleet_driver_vehicle_assignments_live_link_unique',
  )

  // O vínculo vivo é único pela trinca: o mesmo veículo aceita outro motorista e o mesmo
  // motorista aceita outro veículo ao mesmo tempo.
  await database`
    insert into fleet_driver_vehicle_assignments (company_id, driver_id, vehicle_id)
    values (${companyId}, ${secondDriverId}, ${vehicleId})
  `
  await database`
    insert into fleet_driver_vehicle_assignments (company_id, driver_id, vehicle_id)
    values (${companyId}, ${driverId}, ${trailerId})
  `

  await database`
    update fleet_driver_vehicle_assignments set released_at = now() where id = ${assignmentId}
  `
  await database`
    insert into fleet_driver_vehicle_assignments (company_id, driver_id, vehicle_id)
    values (${companyId}, ${driverId}, ${vehicleId})
  `

  return { otherCompanyId, vehicleId, trailerId, driverId, secondDriverId }
}
