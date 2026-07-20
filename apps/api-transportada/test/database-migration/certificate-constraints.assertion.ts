import { SQL } from 'bun'

import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail } from './support.js'

export async function assertCertificateConstraints(
  database: SQL,
  fixture: IdentityFixture,
  otherCompanyId: string,
): Promise<void> {
  await database`
    insert into digital_certificates (
      company_id, purpose, version, status, secret_envelope, validated_cnpj,
      valid_from, expires_at, fingerprint, created_by_user_id
    ) values (
      ${fixture.companyId}, 'cte', 1, 'active', ${{ version: 1 }},
      '12345678000199', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z',
      'fingerprint-1', ${fixture.userId}
    )
  `
  await expectQueryToFail(
    database`
      insert into digital_certificates (
        company_id, purpose, version, status, validated_cnpj, valid_from,
        expires_at, fingerprint, created_by_user_id
      ) values (
        ${fixture.companyId}, 'cte', 1, 'retired', '12345678000199',
        '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z',
        'fingerprint-duplicate-version', ${fixture.userId}
      )
    `,
    '23505',
    'digital_certificates_company_id_purpose_version_unique',
  )
  await expectQueryToFail(
    database`
      insert into digital_certificates (
        company_id, purpose, version, status, secret_envelope, validated_cnpj,
        valid_from, expires_at, fingerprint, created_by_user_id
      ) values (
        ${fixture.companyId}, 'cte', 2, 'active', ${{ version: 1 }},
        '12345678000199', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z',
        'fingerprint-2', ${fixture.userId}
      )
    `,
    '23505',
    'digital_certificates_company_id_purpose_active_unique',
  )
  await expectQueryToFail(
    database`
      insert into digital_certificates (
        company_id, purpose, version, status, validated_cnpj, valid_from,
        expires_at, fingerprint, created_by_user_id
      ) values (
        ${otherCompanyId}, 'cte', 1, 'active', '12345678000199',
        '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z',
        'fingerprint-without-envelope', ${fixture.userId}
      )
    `,
    '23514',
    'digital_certificates_envelope_status_check',
  )
  await expectQueryToFail(
    database`
      insert into digital_certificates (
        company_id, purpose, version, status, validated_cnpj, valid_from,
        expires_at, fingerprint, created_by_user_id
      ) values (
        ${otherCompanyId}, 'cte', 1, 'retired', '12345678000199',
        '2027-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
        'fingerprint-invalid', ${fixture.userId}
      )
    `,
    '23514',
    'digital_certificates_validity_range_check',
  )
}
