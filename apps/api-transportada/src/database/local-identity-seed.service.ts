/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import {
  LOCAL_IDENTITY_SEED_LOCK_ID,
  LOCAL_SEED_ACTORS,
  LOCAL_KEYCLOAK_ISSUER,
  LOCAL_PROJECT_NAME,
} from './local-identity-seed.constant'
import { LocalIdentitySeedRepository } from './local-identity-seed.repository'

type RunLocalIdentitySeedParams = {
  readonly appEnvironment: string
  readonly connectionString: string
  readonly issuer: string
  readonly projectName: string
}

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])

export async function runLocalIdentitySeed({
  appEnvironment,
  connectionString,
  issuer,
  projectName,
}: RunLocalIdentitySeedParams): Promise<void> {
  assertLocalSeedConfiguration({ appEnvironment, connectionString, issuer, projectName })

  const provider = createDrizzleProvider({
    connection: {
      adapter: 'postgres',
      max: 1,
      url: connectionString,
    },
  })

  try {
    await provider.db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(${LOCAL_IDENTITY_SEED_LOCK_ID})`)
      // Em sequência, e não em paralelo: os dois atores dividem a mesma empresa, e duas inserções
      // concorrentes dela na mesma transação seriam a corrida que o `ensureCompany` não vê.
      for (const actor of LOCAL_SEED_ACTORS) {
        await new LocalIdentitySeedRepository({ actor, transaction }).ensureExpectedState()
      }
    })
  } finally {
    await provider.close()
  }
}

function assertLocalSeedConfiguration({
  appEnvironment,
  connectionString,
  issuer,
  projectName,
}: RunLocalIdentitySeedParams): void {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local identity seed is restricted to local and test environments')
  }
  if (connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to seed the local identity')
  }
  if (issuer !== LOCAL_KEYCLOAK_ISSUER) {
    throw new Error('KEYCLOAK_ISSUER must match the versioned local realm')
  }
  if (projectName !== LOCAL_PROJECT_NAME) {
    throw new Error('PROJECT_NAME must match the local TransportAdA project')
  }
}

if (import.meta.main) {
  await runLocalIdentitySeed({
    appEnvironment: process.env.APP_ENV ?? '',
    connectionString: process.env.DATABASE_URL ?? '',
    issuer: process.env.KEYCLOAK_ISSUER ?? '',
    projectName: process.env.PROJECT_NAME ?? '',
  })
}
