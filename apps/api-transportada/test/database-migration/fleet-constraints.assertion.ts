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

  // O flex tem dois tanques, e o segundo tem consumo próprio — o carro não faz km/l de gasolina no etanol
  await database`
    insert into fleet_vehicles (
      company_id, plate, role, vehicle_type, state,
      fuel_type, average_consumption, secondary_fuel_type, secondary_average_consumption
    ) values (
      ${companyId}, 'FLX1A11', 'traction', 'car', 'SP',
      'gasolina-comum', '12.50', 'etanol-hidratado', '8.70'
    )
  `
  // Tanque secundário informado sem consumo é a ficha pela metade, e ela entra: 0 é "não informado"
  await database`
    insert into fleet_vehicles (
      company_id, plate, role, vehicle_type, state, fuel_type, secondary_fuel_type
    ) values (
      ${companyId}, 'FLX2A22', 'traction', 'car', 'SP', 'gasolina-comum', 'eletrico'
    )
  `
  // Dois tanques do mesmo produto não são dois tanques: é o mesmo combustível contado duas vezes
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (
        company_id, plate, role, vehicle_type, state, fuel_type, secondary_fuel_type
      ) values (
        ${companyId}, 'FLX3A33', 'traction', 'car', 'SP', 'gasolina-comum', 'gasolina-comum'
      )
    `,
    '23514',
    'fleet_vehicles_secondary_fuel_check',
  )
  // Consumo de um tanque que não existe é número órfão, e ele entraria na média do R$/km
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (
        company_id, plate, role, vehicle_type, state, secondary_average_consumption
      ) values (
        ${companyId}, 'FLX4A44', 'traction', 'car', 'SP', '9.10'
      )
    `,
    '23514',
    'fleet_vehicles_secondary_fuel_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (
        company_id, plate, role, vehicle_type, state, secondary_fuel_type
      ) values (
        ${companyId}, 'FLX5A55', 'traction', 'car', 'SP', 'querosene'
      )
    `,
    '23514',
    'fleet_vehicles_secondary_fuel_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (
        company_id, plate, role, vehicle_type, state, fuel_type, secondary_fuel_type, secondary_average_consumption
      ) values (
        ${companyId}, 'FLX6A66', 'traction', 'car', 'SP', 'gasolina-comum', 'etanol-hidratado', '-1.00'
      )
    `,
    '23514',
    'fleet_vehicles_cost_check',
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

  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, first_license_at)
      values (${companyId}, 'Motorista Habilitado Cedo Demais', '55566677799', '1899-12-31')
    `,
    '23514',
    'fleet_drivers_dates_check',
  )

  // A razão social pende do CNPJ; a metade contrária fica solta, e é o que a ficha antiga tem
  await database`
    insert into fleet_drivers (company_id, name, tax_id, linked_tax_id, linked_legal_name)
    values (${companyId}, 'Motorista Agregado', '66677788899', '12345678000195', 'Agregado Transportes')
  `
  await database`
    insert into fleet_drivers (company_id, name, tax_id, linked_tax_id)
    values (${companyId}, 'Motorista Sem Razao Social', '77788899900', '98765432000188')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, linked_legal_name)
      values (${companyId}, 'Motorista Sem CNPJ', '88899900011', 'Razao Sem Dono')
    `,
    '23514',
    'fleet_drivers_linked_legal_name_check',
  )

  // O e-mail é o login do motorista no app de entregas; a guarda é de forma, não de existência
  await database`
    insert into fleet_drivers (company_id, name, tax_id, email)
    values (${companyId}, 'Motorista Com Email', '99900011122', 'jose.silva@example.com')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, email)
      values (${companyId}, 'Motorista Com Email Torto', '10020030044', 'jose.silva')
    `,
    '23514',
    'fleet_drivers_email_check',
  )

  // O RNTRC do motorista tem a mesma forma do RNTRC do proprietário do veículo, acima
  await database`
    insert into fleet_drivers (company_id, name, tax_id, rntrc, antt_category)
    values (${companyId}, 'Motorista Com ANTT', '11122233355', '058151044', '0')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, rntrc)
      values (${companyId}, 'Motorista Com RNTRC Torto', '22233344466', '581510441')
    `,
    '23514',
    'fleet_drivers_rntrc_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, antt_category)
      values (${companyId}, 'Motorista Com Categoria Inventada', '33344455577', '9')
    `,
    '23514',
    'fleet_drivers_antt_category_check',
  )

  // A categoria da CNH é a lista do CONTRAN: 'F' não existe, e 'E' é a que puxa carreta
  await database`
    insert into fleet_drivers (company_id, name, tax_id, license_category)
    values (${companyId}, 'Motorista Com CNH E', '44455566688', 'E')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, license_category)
      values (${companyId}, 'Motorista Com CNH Inventada', '55566677799', 'F')
    `,
    '23514',
    'fleet_drivers_license_category_check',
  )

  // Naturalidade e local de emissão da CNH guardam UF, não nome de estado por extenso
  await database`
    insert into fleet_drivers (company_id, name, tax_id, nationality, birth_city, birth_state, license_issued_city, license_issued_state)
    values (${companyId}, 'Motorista Com Naturalidade', '66677788800', 'Brasileira', 'Barrinha', 'SP', 'Ribeirao Preto', 'SP')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, birth_state)
      values (${companyId}, 'Motorista Com UF Por Extenso', '77788899911', 'Sao Paulo')
    `,
    '23514',
    'fleet_drivers_birth_state_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, license_issued_state)
      values (${companyId}, 'Motorista Com DETRAN Por Extenso', '88899900022', 'Sao Paulo')
    `,
    '23514',
    'fleet_drivers_license_issued_state_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, mother_name)
      values (${companyId}, 'Motorista Com Filiacao Longa', '99900011133', ${'M'.repeat(61)})
    `,
    '23514',
    'fleet_drivers_personal_length_check',
  )

  // O RG entra como o estado o imprime, com ponto e traço: não há formato nacional para conferir
  await database`
    insert into fleet_drivers (company_id, name, tax_id, identity_document, identity_document_issuer, identity_document_state)
    values (${companyId}, 'Motorista Com RG', '10020030055', '12.345.678-9', 'SSP', 'SP')
  `
  // O órgão sozinho vale: o operador pode ter a CNH em mãos e o número do RG ilegível
  await database`
    insert into fleet_drivers (company_id, name, tax_id, identity_document_issuer)
    values (${companyId}, 'Motorista Com Orgao Sozinho', '11122233366', 'DETRAN')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, identity_document_issuer)
      values (${companyId}, 'Motorista Com Orgao Inventado', '22233344477', 'SSPX')
    `,
    '23514',
    'fleet_drivers_identity_document_issuer_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, identity_document_state)
      values (${companyId}, 'Motorista Com UF Do RG Por Extenso', '33344455588', 'Sao Paulo')
    `,
    '23514',
    'fleet_drivers_identity_document_state_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, identity_document)
      values (${companyId}, 'Motorista Com RG Longo', '44455566699', ${'1'.repeat(21)})
    `,
    '23514',
    'fleet_drivers_identity_document_check',
  )

  // O endereço do CNPJ do agregado é opcional metade por metade, como o residencial
  await database`
    insert into fleet_drivers (company_id, name, tax_id, linked_postal_code, linked_state, linked_city)
    values (${companyId}, 'Agregado Com Endereco Da Empresa', '12000000011', '14400000', 'SP', 'Franca')
  `
  await database`
    insert into fleet_drivers (company_id, name, tax_id, linked_postal_code)
    values (${companyId}, 'Agregado Com CEP Sozinho', '12000000022', '14400000')
  `
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, linked_postal_code)
      values (${companyId}, 'Agregado Com CEP Mascarado', '12000000033', '14400-000')
    `,
    '23514',
    'fleet_drivers_linked_postal_code_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, linked_state)
      values (${companyId}, 'Agregado Com UF Por Extenso', '12000000044', 'Sao Paulo')
    `,
    '23514',
    'fleet_drivers_linked_state_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_drivers (company_id, name, tax_id, linked_street)
      values (${companyId}, 'Agregado Com Rua Longa', '12000000055', ${'R'.repeat(121)})
    `,
    '23514',
    'fleet_drivers_linked_address_length_check',
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
