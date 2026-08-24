/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A consulta de candidatos contra Postgres de verdade. Ela é uma junção de cinco `left join` sobre
 * tabelas que o worker só **copia** — coluna renomeada na API passa pelo typecheck deste lado e só
 * falha no ciclo, em produção, calada. É por isso que este teste existe fora do gate unitário.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { companyFiscalProfiles } from '../src/database/nfe.schema.js'
import { createDrizzleDistributionCandidateSource } from '../src/nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../src/nfe-distribution-pull/domain/system-distribution-actor.constant.js'
import type { DistributionCandidate } from '../src/nfe-distribution-pull/application/select-eligible-companies.port.js'
import { createLoggerDouble, type LoggedMessage } from './job-run/job-run.double.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

function baseProfile(companyId: string, cnpj: string) {
  return {
    city: 'São Paulo',
    cityIbgeCode: '3550308',
    cnpj,
    companyId,
    complement: 'Sala 1',
    district: 'Centro',
    email: 'fiscal@example.com',
    environment: 'production' as const,
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

describeDatabase('createDrizzleDistributionCandidateSource.listCandidates (integration)', () => {
  const eligibleCompanyId = crypto.randomUUID()
  const optedOutCompanyId = crypto.randomUUID()
  const mdfeOnlyCompanyId = crypto.randomUUID()
  const withoutProfileCompanyId = crypto.randomUUID()
  const certificateOwnerUserId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()

  const companyIds = [
    eligibleCompanyId,
    optedOutCompanyId,
    mdfeOnlyCompanyId,
    withoutProfileCompanyId,
  ]

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const logged: LoggedMessage[] = []
  const source = createDrizzleDistributionCandidateSource({
    database: db,
    logger: createLoggerDouble(logged),
  })

  let candidates: readonly DistributionCandidate[] = []

  function candidateOf(companyId: string): DistributionCandidate {
    const candidate = candidates.find((row) => row.companyId === companyId)
    if (candidate === undefined) throw new Error(`NO_CANDIDATE_FOR_${companyId}`)
    return candidate
  }

  beforeAll(async () => {
    for (const companyId of companyIds) {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    }
    await db.execute(sql`
      insert into identity_users (id, status) values (${certificateOwnerUserId}, 'active')
    `)
    // O ator sintético é semeado pela API; aqui ele é garantido sem ser tomado como nosso.
    await db.execute(sql`
      insert into identity_users (id, status)
      values (${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}, 'active')
      on conflict (id) do nothing
    `)

    await db.insert(companyFiscalProfiles).values([
      baseProfile(eligibleCompanyId, '12345678000190'),
      baseProfile(optedOutCompanyId, '98765432000155'),
      baseProfile(mdfeOnlyCompanyId, '45678912000133'),
    ])

    await db.execute(sql`
      insert into company_distribution_settings (company_id, scheduled_distribution_enabled)
      values (${eligibleCompanyId}, true)
    `)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}, ${eligibleCompanyId}, 'active')
    `)
    await db.execute(sql`
      insert into digital_certificates
        (id, company_id, purpose, version, status, secret_envelope, validated_cnpj,
         valid_from, expires_at, fingerprint, created_by_user_id)
      values
        (${crypto.randomUUID()}, ${eligibleCompanyId}, 'cte', 1, 'active',
         ${{ ciphertext: 'x' }}, '12345678000190',
         now() - interval '1 day', now() + interval '365 days',
         ${`cte-${eligibleCompanyId}`}, ${certificateOwnerUserId})
    `)
    // Só MDF-e: a distribuição assina com o certificado de CT-e, e este não pode aparecer no lugar dele.
    await db.execute(sql`
      insert into digital_certificates
        (id, company_id, purpose, version, status, secret_envelope, validated_cnpj,
         valid_from, expires_at, fingerprint, created_by_user_id)
      values
        (${crypto.randomUUID()}, ${mdfeOnlyCompanyId}, 'mdfe', 1, 'active',
         ${{ ciphertext: 'x' }}, '45678912000133',
         now() - interval '1 day', now() + interval '365 days',
         ${`mdfe-${mdfeOnlyCompanyId}`}, ${certificateOwnerUserId})
    `)
    await db.execute(sql`
      insert into nfe_distribution_cursors (company_id, environment, next_allowed_at)
      values (${eligibleCompanyId}, 'production', now() - interval '2 hours')
    `)
    // Espera aberta do outro ambiente: se a junção ignorasse o ambiente, ela apareceria no candidato.
    await db.execute(sql`
      insert into nfe_distribution_cursors (company_id, environment, next_allowed_at)
      values (${eligibleCompanyId}, 'homologation', now() + interval '10 years')
    `)

    candidates = await source.listCandidates()
  })

  afterAll(async () => {
    for (const companyId of companyIds) {
      await db.execute(sql`delete from nfe_distribution_cursors where company_id = ${companyId}`)
      await db.execute(sql`delete from digital_certificates where company_id = ${companyId}`)
      await db.execute(
        sql`delete from company_distribution_settings where company_id = ${companyId}`,
      )
      await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
      await db.delete(companyFiscalProfiles).where(eq(companyFiscalProfiles.companyId, companyId))
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await db.execute(sql`delete from identity_users where id = ${certificateOwnerUserId}`)
    await provider.close()
  })

  it('reúne os cinco fatos da empresa elegível numa linha só', () => {
    const candidate = candidateOf(eligibleCompanyId)

    expect(candidate.companyStatus).toBe('active')
    expect(candidate.environment).toBe('production')
    expect(candidate.scheduledDistributionEnabled).toBe(true)
    expect(candidate.hasSyntheticMembership).toBe(true)
    expect(candidate.certificate?.status).toBe('active')
    expect(candidate.certificate?.validFrom.getTime()).toBeLessThan(Date.now())
    expect(candidate.certificate?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('a espera lida é a do ambiente do perfil, nunca a do outro', () => {
    const nextAllowedAt = candidateOf(eligibleCompanyId).nextAllowedAt

    expect(nextAllowedAt).toBeDefined()
    expect(nextAllowedAt?.getTime()).toBeLessThan(Date.now())
  })

  it('ausência no join chega como ausência, não como linha a menos', () => {
    const candidate = candidateOf(optedOutCompanyId)

    expect(candidate.scheduledDistributionEnabled).toBe(false)
    expect(candidate.hasSyntheticMembership).toBe(false)
    expect(candidate.certificate).toBeUndefined()
    expect(candidate.nextAllowedAt).toBeUndefined()
  })

  it('certificado de MDF-e não faz as vezes do de CT-e', () => {
    expect(candidateOf(mdfeOnlyCompanyId).certificate).toBeUndefined()
  })

  it('empresa sem perfil fiscal fica de fora, e o ciclo diz por quê', () => {
    expect(candidates.some((row) => row.companyId === withoutProfileCompanyId)).toBe(false)
    expect(
      logged.some(
        (entry) =>
          entry.message === 'nfe_distribution_pull_company_without_fiscal_profile' &&
          JSON.stringify(entry.metadata).includes(withoutProfileCompanyId),
      ),
    ).toBe(true)
  })
})
