/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.3 (ADR-0110 §5, §6 e §11), contra Postgres real: as leituras que o e-mail em HTML precisa — o documento
 * da contratante, a identidade da transportadora (com `hasLogo`) e o assinante (nome, cargo e papéis diretos numa
 * consulta). Toda leitura leva `company_id`: outra empresa não aparece.
 */
import { describe, expect } from 'bun:test'
import { sql } from 'drizzle-orm'

import { createOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'

const CONTRACTOR_TAX_ID = '11222333000181'
const CARRIER_CNPJ = '11444777000161'
const OTHER_CARRIER_CNPJ = '22333444000181'

async function seedFiscalProfile(
  database: TestDatabase,
  params: { readonly cnpj: string; readonly companyId: string; readonly tradeName: string },
): Promise<void> {
  await database.db.execute(sql`
    insert into company_fiscal_profiles
      (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
       tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
       city_ibge_code, phone, email)
    values (
      ${params.companyId}, 'Alfa Transportes e Logística Ltda', ${params.tradeName}, ${params.cnpj},
      'isento', '', '1', '', 'Rua da Empresa', '1', '', 'Centro', 'Ribeirão Preto', 'SP', '14000000',
      '3543402', '', ''
    )
  `)
}

async function seedProfile(
  database: TestDatabase,
  params: { readonly name: string; readonly userId: string },
): Promise<void> {
  await database.db.execute(sql`
    insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address)
    values (${params.userId}, ${params.name}, ${`user-${params.userId}`}, 'email', 'pessoa@transportada.test')
  `)
}

async function seedRoles(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly roles: readonly string[]
    readonly userId: string
  },
): Promise<void> {
  for (const role of params.roles) {
    await database.db.execute(sql`
      insert into membership_roles (membership_id, role)
      select id, ${role} from user_company_memberships
      where user_id = ${params.userId} and company_id = ${params.companyId}
    `)
  }
}

describe('as leituras do e-mail em HTML contra Postgres (spec 272 T2.3)', () => {
  testWithPostgres(
    'findOccurrenceTarget devolve o documento da contratante; outra empresa não acha a ocorrência',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const reader = createOccurrenceMailReader(database.db)

        expect(
          await reader.findOccurrenceTarget({
            companyId: seeded.company.companyId,
            occurrenceId: seeded.occurrenceId,
          }),
        ).toMatchObject({ contractorName: 'Contratante Alfa', contractorTaxId: CONTRACTOR_TAX_ID })
        expect(
          await reader.findOccurrenceTarget({
            companyId: other.companyId,
            occurrenceId: seeded.occurrenceId,
          }),
        ).toBeNull()
      })
    },
    30_000,
  )

  testWithPostgres(
    'findCarrierIdentity: nome de exibição, CNPJ, cidade, razão social e hasLogo — só da própria empresa',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        await seedFiscalProfile(database, {
          cnpj: CARRIER_CNPJ,
          companyId: company.companyId,
          tradeName: 'Alfa Transportes',
        })
        await seedFiscalProfile(database, {
          cnpj: OTHER_CARRIER_CNPJ,
          companyId: other.companyId,
          tradeName: 'Outra Transportes',
        })
        const reader = createOccurrenceMailReader(database.db)

        expect(await reader.findCarrierIdentity({ companyId: company.companyId })).toEqual({
          city: 'Ribeirão Preto',
          cnpj: CARRIER_CNPJ,
          displayName: 'Alfa Transportes',
          hasLogo: false,
          legalName: 'Alfa Transportes e Logística Ltda',
          state: 'SP',
        })

        /** O logo de OUTRA empresa não acende o `hasLogo` desta. */
        await database.db.execute(sql`
          insert into company_logos (company_id, mime_type, content_base64, byte_size, sha256)
          values (${other.companyId}, 'image/png', 'AAAA', 3, ${'a'.repeat(64)})
        `)
        expect((await reader.findCarrierIdentity({ companyId: company.companyId }))?.hasLogo).toBe(
          false,
        )
        expect((await reader.findCarrierIdentity({ companyId: other.companyId }))?.hasLogo).toBe(
          true,
        )

        await database.db.execute(sql`
          insert into company_logos (company_id, mime_type, content_base64, byte_size, sha256)
          values (${company.companyId}, 'image/png', 'AAAA', 3, ${'b'.repeat(64)})
        `)
        expect((await reader.findCarrierIdentity({ companyId: company.companyId }))?.hasLogo).toBe(
          true,
        )

        expect(await reader.findCarrierIdentity({ companyId: crypto.randomUUID() })).toBeUndefined()
      })
    },
    30_000,
  )

  testWithPostgres(
    'findOperatorSigner: cargo livre vence; sem cargo, o rótulo do primeiro papel direto; sem nada, só o nome',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        await seedProfile(database, { name: 'Maria Operadora', userId: company.userId })
        await seedRoles(database, {
          companyId: company.companyId,
          roles: ['viewer', 'operator'],
          userId: company.userId,
        })
        const reader = createOccurrenceMailReader(database.db)
        const params = { companyId: company.companyId, userId: company.userId }

        /** Sem cargo: o primeiro papel na ordem de COMPANY_ROLES (`operator` vem antes de `viewer`). */
        expect(await reader.findOperatorSigner(params)).toEqual({
          hasPicture: false,
          jobTitle: 'Operação',
          name: 'Maria Operadora',
        })

        await database.db.execute(sql`
          update user_company_memberships set job_title = 'Gerente de Operações'
          where user_id = ${company.userId} and company_id = ${company.companyId}
        `)
        expect(await reader.findOperatorSigner(params)).toEqual({
          hasPicture: false,
          jobTitle: 'Gerente de Operações',
          name: 'Maria Operadora',
        })

        /** Com foto de perfil gravada, a assinatura sabe que há foto (a imagem em si sai pela rota pública). */
        await database.db.execute(sql`
          insert into identity_user_pictures (user_id, mime_type, content_base64, byte_size, sha256)
          values (${company.userId}, 'image/png', 'AA==', 1, ${'0'.repeat(64)})
        `)
        expect((await reader.findOperatorSigner(params))?.hasPicture).toBe(true)
        await database.db.execute(
          sql`delete from identity_user_pictures where user_id = ${company.userId}`,
        )

        /** Sem cargo e sem papel direto: a chave `jobTitle` nem existe. */
        await database.db.execute(sql`
          update user_company_memberships set job_title = null
          where user_id = ${company.userId} and company_id = ${company.companyId}
        `)
        await database.db.execute(sql`
          delete from membership_roles
          where membership_id in (select id from user_company_memberships where user_id = ${company.userId})
        `)
        const bare = await reader.findOperatorSigner(params)
        expect(bare).toEqual({ hasPicture: false, name: 'Maria Operadora' })
        expect(Object.hasOwn(bare ?? {}, 'jobTitle')).toBe(false)

        /** Outra empresa: o usuário não tem vínculo lá, então não aparece; membro inativo também não. */
        expect(
          await reader.findOperatorSigner({ companyId: other.companyId, userId: company.userId }),
        ).toBeUndefined()
        await database.db.execute(sql`
          update user_company_memberships set status = 'disabled'
          where user_id = ${company.userId} and company_id = ${company.companyId}
        `)
        expect(await reader.findOperatorSigner(params)).toBeUndefined()
      })
    },
    30_000,
  )
})
