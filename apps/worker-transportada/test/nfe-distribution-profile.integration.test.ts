/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createSecretEnvelopeProvider, type SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { eq, sql } from 'drizzle-orm'

import { companyFiscalProfiles } from '../src/database/nfe.schema.js'
import { digitalCertificates } from '../src/database/cte-issuance-execution.schema.js'
import { createDigitalCertificateSecretService } from '../src/cte-issuance/application/digital-certificate-secret.service.js'
import { DrizzleNfeDistributionProfileRepository } from '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution-profile.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const COMPANY_CNPJ = '12345678000190'
const CERTIFICATE_BASE64 = Buffer.from('fake-pfx-bytes-for-distribution').toString('base64')
const CERTIFICATE_PASSWORD = 'sup3r-secret'
const KEY_ID = 'test-key-1'
const TEXT_ENCODER = new TextEncoder()

const envelopeProvider = createSecretEnvelopeProvider({
  activeKeyId: KEY_ID,
  keys: { [KEY_ID]: new Uint8Array(32).fill(7) },
})
const secretService = createDigitalCertificateSecretService({ envelopeProvider })

async function sealCertificate(input: {
  readonly certificateId: string
  readonly companyId: string
}): Promise<SecretEnvelopeV1> {
  const additionalAuthenticatedData = TEXT_ENCODER.encode(
    `transportada:certificate:v1:${input.companyId}:${input.certificateId}:cte`,
  )
  return envelopeProvider.encrypt({
    additionalAuthenticatedData,
    plaintext: TEXT_ENCODER.encode(
      JSON.stringify({ certificateBase64: CERTIFICATE_BASE64, password: CERTIFICATE_PASSWORD }),
    ),
  })
}

function baseProfile(companyId: string, cnpj: string) {
  return {
    city: 'São Paulo',
    cityIbgeCode: '3550308',
    cnpj,
    companyId,
    complement: 'Sala 1',
    district: 'Centro',
    email: 'fiscal@example.com',
    environment: 'homologation' as const,
    legalName: 'Transportadora Exemplo LTDA',
    municipalRegistration: '000000',
    number: '100',
    phone: '11999999999',
    postalCode: '01001000',
    rntrc: '12345678',
    state: 'SP',
    stateRegistration: '110042490114',
    street: 'Praça da Sé',
    taxRegime: '1' as const,
    tradeName: 'Exemplo',
  }
}

describeDatabase('DrizzleNfeDistributionProfileRepository.loadConfig (integration)', () => {
  const companyWithCert = crypto.randomUUID()
  const companyWithoutCert = crypto.randomUUID()
  const certificateId = crypto.randomUUID()
  const userId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const repository = new DrizzleNfeDistributionProfileRepository(db, { secretService })

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyWithCert}, 'active')`)
    await db.insert(companyFiscalProfiles).values(baseProfile(companyWithCert, COMPANY_CNPJ))
    await db.execute(
      sql`insert into companies (id, status) values (${companyWithoutCert}, 'active')`,
    )
    await db.insert(companyFiscalProfiles).values(baseProfile(companyWithoutCert, '98765432000155'))
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)

    const envelope = await sealCertificate({ certificateId, companyId: companyWithCert })
    await db.execute(sql`
      insert into digital_certificates
        (id, company_id, purpose, version, status, secret_envelope, validated_cnpj,
         valid_from, expires_at, fingerprint, created_by_user_id)
      values
        (${certificateId}, ${companyWithCert}, 'cte', 1, 'active',
         ${envelope}, ${COMPANY_CNPJ},
         now() - interval '1 day', now() + interval '365 days', 'test-fingerprint', ${userId})
    `)
  })

  afterAll(async () => {
    for (const companyId of [companyWithCert, companyWithoutCert]) {
      await db.delete(digitalCertificates).where(eq(digitalCertificates.companyId, companyId))
      await db.delete(companyFiscalProfiles).where(eq(companyFiscalProfiles.companyId, companyId))
    }
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    for (const companyId of [companyWithCert, companyWithoutCert]) {
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await provider.close()
  })

  it('builds an NF-e distribution config from the fiscal profile and active A1 certificate', async () => {
    const config = await repository.loadConfig({ companyId: companyWithCert })

    expect(config.model).toBe('nfe-distribuicao')
    expect(config.cnpj).toBe(COMPANY_CNPJ)
    expect(config.uf).toBe('SP')
    expect(config.environment).toBe('homologation')
    expect(config.certificadoBase64).toBe(CERTIFICATE_BASE64)
    expect(config.certificadoSenha).toBe(CERTIFICATE_PASSWORD)
  })

  it('fails closed when the company has no active certificate', async () => {
    await expect(repository.loadConfig({ companyId: companyWithoutCert })).rejects.toThrow()
  })
})
