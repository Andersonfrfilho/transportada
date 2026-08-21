import { SQL } from 'bun'

import type { FleetFixture } from './fleet-constraints.assertion.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

export async function assertFreightRegionConstraints(
  database: SQL,
  identity: IdentityFixture,
  fleet: FleetFixture,
): Promise<void> {
  const { companyId } = identity
  const { driverId, otherCompanyId } = fleet
  const barretosZoneOneId = crypto.randomUUID()
  const jaboticabalZoneOneId = crypto.randomUUID()
  const otherCompanyRegionId = crypto.randomUUID()

  await database`
    insert into freight_regions (id, company_id, code, name, zone)
    values (${barretosZoneOneId}, ${companyId}, '1.000', 'Barretos Zona 1', 1)
  `
  await database`
    insert into freight_regions (id, company_id, code, name, zone)
    values (${jaboticabalZoneOneId}, ${companyId}, '5.000', 'Jaboticabal Zona 1', 1)
  `

  await expectQueryToFail(
    database`
      insert into freight_regions (company_id, code, name, zone)
      values (${companyId}, '1.000', 'Barretos Repetida', 1)
    `,
    '23505',
    'freight_regions_company_id_code_unique',
  )
  // A rota é da empresa: o mesmo código impresso convive em duas instalações do mesmo produto
  await database`
    insert into freight_regions (id, company_id, code, name, zone)
    values (${otherCompanyRegionId}, ${otherCompanyId}, '1.000', 'Barretos De Outro Tenant', 1)
  `
  await expectQueryToFail(
    database`
      insert into freight_regions (company_id, code, name, zone)
      values (${companyId}, '1004', 'Zona Fora Da Forma', 1)
    `,
    '23514',
    'freight_regions_code_check',
  )

  /**
   * ⚠️ BARRINHA/SP está nas duas rotas na tabela real do cliente, com preços diferentes. Se esta
   * inserção falhar, a importação da tabela do cliente para na segunda linha.
   */
  await database`
    insert into freight_region_cities (company_id, region_id, city, state)
    values (${companyId}, ${barretosZoneOneId}, 'BARRINHA', 'SP')
  `
  await database`
    insert into freight_region_cities (company_id, region_id, city, state)
    values (${companyId}, ${jaboticabalZoneOneId}, 'BARRINHA', 'SP')
  `
  await expectQueryToFail(
    database`
      insert into freight_region_cities (company_id, region_id, city, state)
      values (${companyId}, ${barretosZoneOneId}, 'BARRINHA', 'SP')
    `,
    '23505',
    'freight_region_cities_region_city_unique',
  )
  await expectQueryToFail(
    database`
      insert into freight_region_cities (company_id, region_id, city, state)
      values (${companyId}, ${otherCompanyRegionId}, 'BARRINHA', 'SP')
    `,
    '23503',
    'freight_region_cities_company_region_fk',
  )

  await database`
    insert into freight_region_driver_rates (company_id, region_id, freight_class, driver_amount)
    values (${companyId}, ${barretosZoneOneId}, 'truck', 1086.1200)
  `
  await expectQueryToFail(
    database`
      insert into freight_region_driver_rates (company_id, region_id, freight_class, driver_amount)
      values (${companyId}, ${barretosZoneOneId}, 'truck', 1200.0000)
    `,
    '23505',
    'freight_region_driver_rates_region_class_unique',
  )
  await expectQueryToFail(
    database`
      insert into freight_region_driver_rates (company_id, region_id, freight_class, driver_amount)
      values (${companyId}, ${barretosZoneOneId}, 'carreta', 900.0000)
    `,
    '23514',
    'freight_region_driver_rates_class_check',
  )
  // Pagar valor negativo não é desconto, é erro de digitação
  await expectQueryToFail(
    database`
      insert into freight_region_driver_rates (company_id, region_id, freight_class, driver_amount)
      values (${companyId}, ${barretosZoneOneId}, 'van', -1.0000)
    `,
    '23514',
    'freight_region_driver_rates_amount_check',
  )

  await database`
    insert into fleet_driver_regions (company_id, driver_id, region_id, scope)
    values (${companyId}, ${driverId}, ${barretosZoneOneId}, 'region')
  `
  await database`
    insert into fleet_driver_regions (company_id, driver_id, region_id, scope, city, state)
    values (${companyId}, ${driverId}, ${jaboticabalZoneOneId}, 'city', 'BARRINHA', 'SP')
  `
  await expectQueryToFail(
    database`
      insert into fleet_driver_regions (company_id, driver_id, region_id, scope)
      values (${companyId}, ${driverId}, ${otherCompanyRegionId}, 'region')
    `,
    '23503',
    'fleet_driver_regions_company_region_fk',
  )
  // Cobertura de cidade sem cidade não cobre nada; zona com cidade é zona disfarçada
  await expectQueryToFail(
    database`
      insert into fleet_driver_regions (company_id, driver_id, region_id, scope)
      values (${companyId}, ${driverId}, ${jaboticabalZoneOneId}, 'city')
    `,
    '23514',
    'fleet_driver_regions_city_check',
  )
  await expectQueryToFail(
    database`
      insert into fleet_driver_regions (company_id, driver_id, region_id, scope, city, state)
      values (${companyId}, ${driverId}, ${barretosZoneOneId}, 'region', 'BARRINHA', 'SP')
    `,
    '23514',
    'fleet_driver_regions_city_check',
  )

  // O tipo do veículo é catálogo fechado — a classe da tabela de frete sai dele, e nome de fora não entra
  await expectQueryToFail(
    database`
      insert into fleet_vehicles (company_id, plate, role, vehicle_type, state)
      values (${companyId}, 'FRT1A11', 'traction', 'carreta', 'SP')
    `,
    '23514',
    'fleet_vehicles_vehicle_type_check',
  )
  await database`
    insert into fleet_vehicles (company_id, plate, role, vehicle_type, state)
    values (${companyId}, 'FRT1A11', 'trailer', '', 'SP')
  `
}
