/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type ActorEmailResolver = {
  resolve(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined>
}

/**
 * Spec 143 T009 (RF13): o destinatário do e-mail de teste é o e-mail do administrador autenticado,
 * nunca o corpo da requisição. `email` é o campo dedicado de `identity_user_profiles` (diferente de
 * `contactAddress`, que pode ser telefone) — o mesmo molde de junção de
 * `notification/infrastructure/identity-recipient.resolver.ts`: passa pelo `user_company_memberships`
 * ativo daquela empresa, nunca só pelo `userId`, para o mesmo `userId` noutra empresa não vazar o
 * contato daqui.
 */
export function createActorEmailRepository(input: {
  readonly database: Database
}): ActorEmailResolver {
  return {
    async resolve({ companyId, userId }) {
      const [row] = await input.database
        .select({ email: identityUserProfiles.email })
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

      if (row === undefined || row.email.trim() === '') return undefined
      return row.email
    },
  }
}
