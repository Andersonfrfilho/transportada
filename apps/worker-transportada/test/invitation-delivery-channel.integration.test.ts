/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { DrizzleInvitationDeliveryRepository } from '../src/identity/infrastructure/drizzle-invitation.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

/** O hash é único por convite: derivá-lo do id evita colidir com o outro convite semeado. */
function codeHashFor(invitationId: string): string {
  return invitationId.replaceAll('-', '').repeat(2)
}

/**
 * O canal é da empresa (`company_fiscal_profiles.activation_channel`), não do perfil de quem foi
 * convidado — o perfil só diz para onde mandar. Empresa sem configuração ainda entrega por e-mail.
 */
describeDatabase('canal de ativação lido pelo worker (integration)', () => {
  const configuredCompanyId = crypto.randomUUID()
  const bareCompanyId = crypto.randomUUID()
  const configuredUserId = crypto.randomUUID()
  const bareUserId = crypto.randomUUID()
  const configuredInvitationId = crypto.randomUUID()
  const bareInvitationId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const repository = new DrizzleInvitationDeliveryRepository(provider.db)

  async function seedInvitation(params: {
    readonly companyId: string
    readonly invitationId: string
    readonly userId: string
  }): Promise<void> {
    await provider.db.execute(
      sql`insert into companies (id, status) values (${params.companyId}, 'active')`,
    )
    await provider.db.execute(sql`insert into identity_users (id) values (${params.userId})`)
    await provider.db.execute(
      sql`insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address)
          values (${params.userId}, 'Convidada', ${params.userId}, 'email', 'convidada@example.test')`,
    )
    await provider.db.execute(
      sql`insert into user_company_memberships (user_id, company_id)
          values (${params.userId}, ${params.companyId})`,
    )
    await provider.db.execute(
      sql`insert into user_invitations (id, company_id, user_id, code_hash, expires_at, sealed_code)
          values (${params.invitationId}, ${params.companyId}, ${params.userId}, ${codeHashFor(params.invitationId)},
                  now() + interval '1 day', ${JSON.stringify({ ciphertext: 'x' })}::jsonb)`,
    )
  }

  beforeAll(async () => {
    await seedInvitation({
      companyId: configuredCompanyId,
      invitationId: configuredInvitationId,
      userId: configuredUserId,
    })
    await seedInvitation({
      companyId: bareCompanyId,
      invitationId: bareInvitationId,
      userId: bareUserId,
    })
    await provider.db.execute(
      sql`insert into company_fiscal_profiles (
            company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
            tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
            city_ibge_code, phone, email, activation_channel
          ) values (
            ${configuredCompanyId}, 'Transportadora Integration', 'Integration', '61156864000191',
            '', '', '1', '58151044', 'Rua Contract', '2296', '', 'Independencia',
            'Ribeirao Preto', 'SP', '14076400', '3543402', '', '', 'whatsapp'
          )`,
    )
  })

  afterAll(async () => {
    for (const companyId of [configuredCompanyId, bareCompanyId]) {
      await provider.db.execute(sql`delete from user_invitations where company_id = ${companyId}`)
      await provider.db.execute(
        sql`delete from user_company_memberships where company_id = ${companyId}`,
      )
      await provider.db.execute(
        sql`delete from company_fiscal_profiles where company_id = ${companyId}`,
      )
      await provider.db.execute(sql`delete from companies where id = ${companyId}`)
    }
    for (const userId of [configuredUserId, bareUserId]) {
      await provider.db.execute(sql`delete from identity_user_profiles where user_id = ${userId}`)
      await provider.db.execute(sql`delete from identity_users where id = ${userId}`)
    }
    await provider.close()
  })

  it('entrega pelo canal configurado na empresa, não pelo canal do perfil', async () => {
    const record = await repository.findForDelivery({
      companyId: configuredCompanyId,
      invitationId: configuredInvitationId,
    })

    expect(record?.contactChannel).toBe('whatsapp')
    expect(record?.contactAddress).toBe('convidada@example.test')
  })

  it('empresa sem configuração fiscal entrega por e-mail', async () => {
    const record = await repository.findForDelivery({
      companyId: bareCompanyId,
      invitationId: bareInvitationId,
    })

    expect(record?.contactChannel).toBe('email')
  })
})
