/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { externalIdentities, identityUsers } from '../../database/database.schema'
import type {
  ActiveExternalIdentity,
  ExternalIdentityLookup,
  ExternalIdentityRepositoryPort,
} from '../application/identity.port'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleExternalIdentityRepository implements ExternalIdentityRepositoryPort {
  private readonly database: IdentityDatabase

  public constructor(database: IdentityDatabase) {
    this.database = database
  }

  public async findActiveByIssuerAndSubject({
    issuer,
    subject,
  }: ExternalIdentityLookup): Promise<ActiveExternalIdentity | null> {
    const [identity] = await this.database
      .select({
        externalIdentityId: externalIdentities.id,
        userId: externalIdentities.userId,
      })
      .from(externalIdentities)
      .innerJoin(identityUsers, eq(identityUsers.id, externalIdentities.userId))
      .where(
        and(
          eq(externalIdentities.issuer, issuer),
          eq(externalIdentities.subject, subject),
          eq(identityUsers.status, 'active'),
        ),
      )
      .limit(1)

    return identity ?? null
  }
}
