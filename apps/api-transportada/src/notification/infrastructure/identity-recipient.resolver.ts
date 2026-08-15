/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type {
  RecipientResolverPort,
  ResolvedRecipient,
} from '@adatechnology/notification-contracts'
import { and, eq } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CreateIdentityRecipientResolverParams = {
  readonly db: Database
}

/**
 * O módulo de notificações não conhece a tabela de usuários do produto: ele pergunta o endereço no
 * instante do envio, e é por isso que o schema dele guarda só máscara e HMAC.
 *
 * A junção passa pelo `user_company_memberships` de propósito — o perfil não tem empresa, quem tem
 * é o vínculo. Pedir o mesmo `userId` pelo contexto de outra empresa tem de devolver "não existe",
 * e não o contato da pessoa.
 */
export function createIdentityRecipientResolver({
  db,
}: CreateIdentityRecipientResolverParams): RecipientResolverPort {
  return {
    async resolve({ companyId, userId }): Promise<ResolvedRecipient | undefined> {
      const [row] = await db
        .select({
          contactAddress: identityUserProfiles.contactAddress,
          contactChannel: identityUserProfiles.contactChannel,
          name: identityUserProfiles.name,
        })
        .from(identityUserProfiles)
        .innerJoin(
          userCompanyMemberships,
          eq(userCompanyMemberships.userId, identityUserProfiles.userId),
        )
        .where(
          and(
            eq(identityUserProfiles.userId, userId),
            eq(userCompanyMemberships.companyId, companyId),
            eq(userCompanyMemberships.status, 'active'),
          ),
        )
        .limit(1)

      if (row === undefined) return undefined

      return row.contactChannel === 'email'
        ? { displayName: row.name, email: row.contactAddress }
        : { displayName: row.name, phone: row.contactAddress }
    },
  }
}
