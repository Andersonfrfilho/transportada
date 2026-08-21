/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import { fleetDrivers } from '../../src/database/database.schema.js'
import { LICENSE_CATEGORIES } from '../../src/shared/license-category.constant.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const dialect = new PgDialect()

describe('fleet driver schema', () => {
  test('stores the operational record the condutor group is built from', () => {
    expect(getTableConfig(fleetDrivers).name).toBe('fleet_drivers')
    expectGeneratedUuidPrimaryKey(fleetDrivers)
    expectRequiredUtcTimestamps(fleetDrivers)

    expect(columnNames(fleetDrivers)).toEqual([
      'id',
      'company_id',
      'membership_id',
      'name',
      'tax_id',
      'linked_tax_id',
      'linked_legal_name',
      'license_number',
      'license_category',
      'license_expires_at',
      'first_license_at',
      'birth_date',
      'nationality',
      'birth_city',
      'birth_state',
      'father_name',
      'mother_name',
      'license_issued_city',
      'license_issued_state',
      'email',
      'phone',
      'rntrc',
      'antt_category',
      'postal_code',
      'street',
      'number',
      'complement',
      'district',
      'city',
      'state',
      'status',
      'version',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(fleetDrivers)).toMatchObject({
      company_id: 'uuid',
      id: 'uuid',
      membership_id: 'uuid',
      version: 'bigint',
    })
  })

  // Motorista sem login roda o MDF-e inteiro — o vínculo com identidade chega depois.
  // As duas datas são nulas quando ausentes: coluna `date` não tem a string vazia que
  // serve de ausência para os campos de texto opcionais.
  test('leaves the login link and the two dates nullable, and requires every other column', () => {
    const nullable = ['membership_id', 'license_expires_at', 'first_license_at', 'birth_date']

    expect(requiredColumnNames(fleetDrivers)).toEqual(
      columnNames(fleetDrivers).filter((column) => !nullable.includes(column)),
    )
  })

  test('scopes the CPF to the tenant and exposes the composite tenant key', () => {
    expect(uniqueColumnsByName(fleetDrivers)).toMatchObject({
      fleet_drivers_company_id_id_unique: ['company_id', 'id'],
      fleet_drivers_company_id_tax_id_unique: ['company_id', 'tax_id'],
    })
  })

  test('lets at most one driver hold a given login', () => {
    const membershipUnique = getTableConfig(fleetDrivers).indexes.find(
      (tableIndex) => tableIndex.config.name === 'fleet_drivers_company_membership_unique',
    )

    expect(membershipUnique?.config.unique).toBeTrue()
    expect(
      membershipUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'membership_id'])
    expect(
      membershipUnique?.config.where === undefined
        ? undefined
        : dialect.sqlToQuery(membershipUnique.config.where).sql,
    ).toBe(`"fleet_drivers"."membership_id" is not null`)
  })

  test('constrains the fiscal identification the condutor group freezes into the XML', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_tax_id_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_drivers_name_check).toContain('> 0')
    expect(checks.fleet_drivers_name_check).toContain('<= 60')
    expect(checks.fleet_drivers_status_check).toContain("in ('active', 'inactive')")
  })

  // O condutor do MDF-e é sempre pessoa física; o CNPJ do autônomo entra ao lado do CPF, nunca no lugar dele
  test('keeps the CPF mandatory and the linked CNPJ optional', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_linked_tax_id_check).toContain("~ '^[A-Z0-9]{12}[0-9]{2}$'")
    expect(checks.fleet_drivers_linked_tax_id_check).toContain('= 0')
    expect(checks.fleet_drivers_tax_id_check).not.toContain('{14}')
  })

  // A razão social é o nome que o MDF-e usa quando o proprietário é o CNPJ do agregado —
  // sem CNPJ ela não tem dono, e a metade contrária fica solta de propósito: ficha antiga
  // tem CNPJ e não tem razão social, e a migration não teria de onde a buscar.
  test('hangs the company name on the linked CNPJ, never the other way around', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_linked_legal_name_check).toContain('<= 60')
    expect(checks.fleet_drivers_linked_legal_name_check).toContain('linked_tax_id')
  })

  // O e-mail nasce do cadastro do motorista e é o login dele no app de entregas
  test('accepts an empty e-mail and caps it where the identity boundary caps it', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_email_check).toContain('@')
    expect(checks.fleet_drivers_email_check).toContain('= 0')
    expect(checks.fleet_drivers_email_check).toContain('<= 254')
  })

  // ANTT do motorista é o que o agregado carrega para o MDF-e; o veículo já guarda o par igual
  test('shapes the ANTT registration like the vehicle owner already shapes it', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_rntrc_check).toContain("~ '^0?[0-9]{8}$'")
    expect(checks.fleet_drivers_rntrc_check).toContain('= 0')
    expect(checks.fleet_drivers_antt_category_check).toContain("in ('0', '1', '2')")
    expect(checks.fleet_drivers_antt_category_check).toContain('= 0')
  })

  // A categoria é lista fechada do CONTRAN: ficha antiga não tem nenhuma, e vazio continua valendo
  test('closes the CNH category on the CONTRAN catalog without demanding it', () => {
    const checks = checkSqlByName(fleetDrivers)

    for (const category of LICENSE_CATEGORIES) {
      expect(checks.fleet_drivers_license_category_check).toContain(`'${category}'`)
    }
    expect(checks.fleet_drivers_license_category_check).toContain('= 0')
  })

  test('accepts an empty CNH and phone, which the MDF-e does not require', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_license_number_check).toContain("~ '^[0-9]{11}$'")
    expect(checks.fleet_drivers_license_number_check).toContain('= 0')
    expect(checks.fleet_drivers_phone_check).toContain("~ '^[0-9]{10,11}$'")
    expect(checks.fleet_drivers_phone_check).toContain('= 0')
  })

  // A CNH é opcional, mas duas fichas não podem reivindicar a mesma habilitação
  test('lets at most one driver hold a given license number', () => {
    const licenseUnique = getTableConfig(fleetDrivers).indexes.find(
      (tableIndex) => tableIndex.config.name === 'fleet_drivers_company_license_number_unique',
    )

    expect(licenseUnique?.config.unique).toBeTrue()
    expect(
      licenseUnique?.config.columns.map((column) => ('name' in column ? column.name : '')),
    ).toEqual(['company_id', 'license_number'])
    expect(
      licenseUnique?.config.where === undefined
        ? undefined
        : dialect.sqlToQuery(licenseUnique.config.where).sql,
    ).toBe(`length("fleet_drivers"."license_number") > 0`)
  })

  // O piso é data fixa, não `current_date`: função volátil em CHECK quebraria o restore do dump
  test('floors both dates and shapes the optional address', () => {
    const checks = checkSqlByName(fleetDrivers)

    expect(checks.fleet_drivers_dates_check).toContain("date '1900-01-01'")
    expect(checks.fleet_drivers_dates_check).toContain('first_license_at')
    expect(checks.fleet_drivers_dates_check).not.toContain('current_date')
    expect(checks.fleet_drivers_postal_code_check).toContain("~ '^[0-9]{8}$'")
    expect(checks.fleet_drivers_postal_code_check).toContain('= 0')
    expect(checks.fleet_drivers_address_state_check).toContain("~ '^[A-Z]{2}$'")
    expect(checks.fleet_drivers_address_state_check).toContain('= 0')
    expect(checks.fleet_drivers_address_length_check).toContain('<= 120')
  })

  test('starts the optimistic lock at a positive version', () => {
    expect(checkSqlByName(fleetDrivers).fleet_drivers_version_check).toContain('> 0')
  })
})
