/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createIdentityRecipientResolver } from '../../src/notification/infrastructure/identity-recipient.resolver.js'
import { testWithPostgres, withDisposableDatabase } from '../database-migration/support.js'

type SeededTenants = {
  readonly companyId: string
  readonly otherCompanyId: string
  readonly userId: string
  readonly disabledUserId: string
  readonly profilelessUserId: string
  readonly phoneUserId: string
}

async function seedTenants(database: {
  unsafe(query: string): Promise<unknown>
}): Promise<SeededTenants> {
  const seeded: SeededTenants = {
    companyId: crypto.randomUUID(),
    disabledUserId: crypto.randomUUID(),
    otherCompanyId: crypto.randomUUID(),
    phoneUserId: crypto.randomUUID(),
    profilelessUserId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
  }

  await database.unsafe(`
    insert into companies (id) values
      ('${seeded.companyId}'), ('${seeded.otherCompanyId}');

    insert into identity_users (id) values
      ('${seeded.userId}'), ('${seeded.disabledUserId}'), ('${seeded.profilelessUserId}'),
      ('${seeded.phoneUserId}');

    insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address) values
      ('${seeded.userId}', 'Alice', 'alice', 'email', 'alice@example.test'),
      ('${seeded.disabledUserId}', 'Bruno', 'bruno', 'email', 'bruno@example.test'),
      ('${seeded.phoneUserId}', 'Carla', 'carla', 'whatsapp', '+5511999990000');

    insert into user_company_memberships (user_id, company_id, status) values
      ('${seeded.userId}', '${seeded.companyId}', 'active'),
      ('${seeded.disabledUserId}', '${seeded.companyId}', 'disabled'),
      ('${seeded.profilelessUserId}', '${seeded.companyId}', 'active'),
      ('${seeded.phoneUserId}', '${seeded.companyId}', 'active');
  `)

  return seeded
}

async function withResolver(
  callback: (
    resolver: ReturnType<typeof createIdentityRecipientResolver>,
    seeded: SeededTenants,
  ) => Promise<void>,
): Promise<void> {
  await withDisposableDatabase(async (database, connectionString) => {
    await runDatabaseMigrations({ connectionString })
    const seeded = await seedTenants(database)

    const provider = createDrizzleProvider({
      connection: { adapter: 'postgres', max: 1, url: connectionString },
    })

    try {
      await callback(createIdentityRecipientResolver({ db: provider.db }), seeded)
    } finally {
      await provider.close()
    }
  })
}

describe('Notification recipient resolver contract', () => {
  testWithPostgres('resolve o contato de e-mail do membro da empresa', async () => {
    await withResolver(async (resolver, seeded) => {
      expect(await resolver.resolve({ companyId: seeded.companyId, userId: seeded.userId })).toEqual(
        {
          displayName: 'Alice',
          email: 'alice@example.test',
        },
      )
    })
  })

  // O contrato que mais importa: o mesmo usuário, pedido pelo contexto de outra empresa, não existe
  testWithPostgres('recusa destinatário de outra empresa', async () => {
    await withResolver(async (resolver, seeded) => {
      expect(
        await resolver.resolve({ companyId: seeded.otherCompanyId, userId: seeded.userId }),
      ).toBeUndefined()
    })
  })

  testWithPostgres('recusa membro desabilitado', async () => {
    await withResolver(async (resolver, seeded) => {
      expect(
        await resolver.resolve({ companyId: seeded.companyId, userId: seeded.disabledUserId }),
      ).toBeUndefined()
    })
  })

  testWithPostgres('recusa usuário sem perfil, em vez de devolver contato vazio', async () => {
    await withResolver(async (resolver, seeded) => {
      expect(
        await resolver.resolve({ companyId: seeded.companyId, userId: seeded.profilelessUserId }),
      ).toBeUndefined()
    })
  })

  // Contato de whatsapp não vira e-mail: o canal errado entregaria para um endereço inválido
  testWithPostgres('devolve telefone, e não e-mail, quando o contato é de outro canal', async () => {
    await withResolver(async (resolver, seeded) => {
      expect(
        await resolver.resolve({ companyId: seeded.companyId, userId: seeded.phoneUserId }),
      ).toEqual({
        displayName: 'Carla',
        phone: '+5511999990000',
      })
    })
  })
})
