/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { identityUserProfiles, loginIdentifiers } from '../../database/database.schema'
import type { LoginIdentifierRepositoryPort } from '../application/login-identifier.port.js'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * A busca é global, sem empresa: ela acontece antes de existir sessão, e portanto antes de existir
 * empresa. É o único ponto do módulo em que isso é verdade — e é por isso que a resposta nunca
 * revela nada: quem pergunta ainda não provou ser ninguém.
 */
export function createDrizzleLoginIdentifierRepository(
  database: IdentityDatabase,
): LoginIdentifierRepositoryPort {
  return {
    async findByIdentifier({ kind, value }) {
      return database
        .select({ username: identityUserProfiles.username })
        .from(loginIdentifiers)
        .innerJoin(identityUserProfiles, eq(identityUserProfiles.userId, loginIdentifiers.userId))
        .where(and(eq(loginIdentifiers.kind, kind), eq(loginIdentifiers.value, value)))
        .limit(2)
    },
  }
}
