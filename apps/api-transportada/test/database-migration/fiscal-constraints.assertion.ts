import { SQL } from 'bun'
import { expect } from 'bun:test'

import { assertCertificateConstraints } from './certificate-constraints.assertion.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

export async function assertFiscalConstraints(
  database: SQL,
  fixture: IdentityFixture,
): Promise<void> {
  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`

  await database`
    insert into company_fiscal_profiles (
      company_id, legal_name, trade_name, cnpj, state_registration,
      municipal_registration, tax_regime, rntrc, street, number, complement,
      district, city, state, postal_code, city_ibge_code, phone, email
    ) values (
      ${fixture.companyId}, 'Transportadora Local', '', '12345678000199', '',
      '', '3', '12345678', 'Rua Local', '1', '', 'Centro', 'Curitiba', 'PR',
      '80000000', '4106902', '', ''
    )
  `
  await expectQueryToFail(
    database`
      insert into company_fiscal_profiles (
        company_id, legal_name, trade_name, cnpj, state_registration,
        municipal_registration, tax_regime, rntrc, street, number, complement,
        district, city, state, postal_code, city_ibge_code, phone, email
      ) values (
        ${otherCompanyId}, 'Outra Transportadora', '', '12345678000199', '',
        '', '3', '87654321', 'Rua Dois', '2', '', 'Centro', 'Curitiba', 'PR',
        '80000001', '4106902', '', ''
      )
    `,
    '23505',
    'company_fiscal_profiles_cnpj_unique',
  )

  // O perfil aceita o registro como o certificado da ANTT o imprime; nove dígitos sem o zero, não.
  await expectQueryToFail(
    database`
      insert into company_fiscal_profiles (
        company_id, legal_name, trade_name, cnpj, state_registration,
        municipal_registration, tax_regime, rntrc, street, number, complement,
        district, city, state, postal_code, city_ibge_code, phone, email
      ) values (
        ${otherCompanyId}, 'Outra Transportadora', '', '98765432000188', '',
        '', '3', '581510441', 'Rua Dois', '2', '', 'Centro', 'Curitiba', 'PR',
        '80000001', '4106902', '', ''
      )
    `,
    '23514',
    'company_fiscal_profiles_rntrc_check',
  )
  await database`
    update company_fiscal_profiles set rntrc = '058151044' where company_id = ${fixture.companyId}
  `

  await assertCertificateConstraints(database, fixture, otherCompanyId)

  const sequenceId = crypto.randomUUID()
  await database`
    insert into fiscal_sequences (
      id, company_id, environment, model, series, next_number
    ) values (${sequenceId}, ${fixture.companyId}, 'homologation', 'cte', 1, 1)
  `
  await expectQueryToFail(
    database`
      insert into fiscal_sequences (
        company_id, environment, model, series, next_number
      ) values (${fixture.companyId}, 'homologation', 'cte', 1, 1)
    `,
    '23505',
    'fiscal_sequences_company_id_environment_model_series_unique',
  )
  await expectQueryToFail(
    database`
      insert into fiscal_sequence_reservations (
        company_id, fiscal_sequence_id, reservation_key, number
      ) values (${otherCompanyId}, ${sequenceId}, 'cross-tenant', 1)
    `,
    '23503',
    'fiscal_sequence_reservations_company_sequence_fk',
  )
  const reservationId = crypto.randomUUID()
  await database`
    insert into fiscal_sequence_reservations (
      id, company_id, fiscal_sequence_id, reservation_key, number
    ) values (${reservationId}, ${fixture.companyId}, ${sequenceId}, 'reservation-1', 1)
  `
  await expectQueryToFail(
    database`
      insert into fiscal_sequence_reservations (
        company_id, fiscal_sequence_id, reservation_key, number
      ) values (${fixture.companyId}, ${sequenceId}, 'reservation-1', 2)
    `,
    '23505',
    'fiscal_sequence_reservations_company_id_reservation_key_unique',
  )
  await expectQueryToFail(
    database`
      insert into fiscal_sequence_reservations (
        company_id, fiscal_sequence_id, reservation_key, number
      ) values (${fixture.companyId}, ${sequenceId}, 'reservation-2', 1)
    `,
    '23505',
    'fiscal_sequence_reservations_sequence_id_number_unique',
  )
  await expectQueryToFail(
    database`update fiscal_sequence_reservations set number = 2 where id = ${reservationId}`,
    '55000',
  )
  await expectQueryToFail(
    database`delete from fiscal_sequence_reservations where id = ${reservationId}`,
    '55000',
  )
  const reservations = await database<Array<{ readonly number: string }>>`
    select number from fiscal_sequence_reservations where id = ${reservationId}
  `
  expect(reservations).toEqual([{ number: '1' }])

  await database`
    insert into idempotency_records (
      company_id, operation, idempotency_key, request_fingerprint, status, response
    ) values (${fixture.companyId}, 'profile.update', 'idempotency-1', 'fingerprint', 'done', ${{}})
  `
  await expectQueryToFail(
    database`
      insert into idempotency_records (
        company_id, operation, idempotency_key, request_fingerprint, status, response
      ) values (
        ${fixture.companyId}, 'profile.update', 'idempotency-1',
        'another-fingerprint', 'done', ${{}}
      )
    `,
    '23505',
    'idempotency_records_company_id_operation_idempotency_key_unique',
  )

  const auditId = crypto.randomUUID()
  await database`
    insert into audit_logs (
      id, company_id, actor_user_id, action, entity_type, entity_id, correlation_id
    ) values (
      ${auditId}, ${fixture.companyId}, ${fixture.userId}, 'profile.updated',
      'company_fiscal_profile', ${fixture.companyId}, 'correlation-1'
    )
  `
  await expectQueryToFail(
    database`update audit_logs set action = 'changed' where id = ${auditId}`,
    '55000',
  )
  await expectQueryToFail(database`delete from audit_logs where id = ${auditId}`, '55000')
  const auditRows = await database<Array<{ readonly action: string }>>`
    select action from audit_logs where id = ${auditId}
  `
  expect(auditRows).toEqual([{ action: 'profile.updated' }])
}
