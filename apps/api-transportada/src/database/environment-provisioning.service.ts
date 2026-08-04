/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { isTrustedIdentityUrl } from '../config/environment.schema'
import {
  ENVIRONMENT_PROVISIONING_LOCK_ID,
  POSTGRESQL_PROTOCOLS,
} from './environment-provisioning.constant'
import { EnvironmentProvisioningConfigurationError } from './environment-provisioning.error'
import {
  EnvironmentProvisioningRepository,
  type EnvironmentProvisioningState,
} from './environment-provisioning.repository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type EnvironmentProvisioningConfiguration = {
  readonly adminSubject: string
  readonly companyId: string
  readonly connectionString: string
  readonly issuer: string
}

/**
 * A empresa e o primeiro administrador do ambiente vêm da configuração do deploy —
 * nunca de payload de requisição (ADR-0021: a empresa é o ambiente).
 */
export function readEnvironmentProvisioningConfiguration(
  source: Readonly<Record<string, string | undefined>>,
): EnvironmentProvisioningConfiguration {
  const configuration: EnvironmentProvisioningConfiguration = {
    adminSubject: (source.PROVISION_ADMIN_SUBJECT ?? '').trim(),
    companyId: (source.PROVISION_COMPANY_ID ?? '').trim(),
    connectionString: (source.DATABASE_URL ?? '').trim(),
    issuer: (source.KEYCLOAK_ISSUER ?? '').trim(),
  }
  assertConfiguration(configuration)

  return configuration
}

/**
 * O deploy roda o comando em toda subida. Ambiente que ainda não declarou empresa nem
 * administrador pula sem falhar; declarou pela metade é erro, não silêncio.
 */
export function isEnvironmentProvisioningConfigured(
  source: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    (source.PROVISION_COMPANY_ID ?? '').trim().length > 0 ||
    (source.PROVISION_ADMIN_SUBJECT ?? '').trim().length > 0
  )
}

export async function runEnvironmentProvisioning(
  configuration: EnvironmentProvisioningConfiguration,
): Promise<EnvironmentProvisioningState> {
  assertConfiguration(configuration)

  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: configuration.connectionString },
  })

  try {
    return await provider.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(${ENVIRONMENT_PROVISIONING_LOCK_ID})`,
      )

      return await new EnvironmentProvisioningRepository(transaction).ensureExpectedState({
        adminSubject: configuration.adminSubject,
        companyId: configuration.companyId,
        issuer: configuration.issuer,
      })
    })
  } finally {
    await provider.close()
  }
}

function assertConfiguration(configuration: EnvironmentProvisioningConfiguration): void {
  if (!isPostgresqlUrl(configuration.connectionString)) {
    throw new EnvironmentProvisioningConfigurationError('DATABASE_URL_INVALID')
  }
  if (!isTrustedIdentityUrl(configuration.issuer)) {
    throw new EnvironmentProvisioningConfigurationError('KEYCLOAK_ISSUER_INVALID')
  }
  if (!UUID_PATTERN.test(configuration.companyId)) {
    throw new EnvironmentProvisioningConfigurationError('PROVISION_COMPANY_ID_INVALID')
  }
  if (configuration.adminSubject.trim().length === 0) {
    throw new EnvironmentProvisioningConfigurationError('PROVISION_ADMIN_SUBJECT_INVALID')
  }
}

function isPostgresqlUrl(value: string): boolean {
  try {
    return POSTGRESQL_PROTOCOLS.includes(
      new URL(value).protocol as (typeof POSTGRESQL_PROTOCOLS)[number],
    )
  } catch {
    return false
  }
}

if (import.meta.main) {
  if (isEnvironmentProvisioningConfigured(process.env)) {
    const state = await runEnvironmentProvisioning(
      readEnvironmentProvisioningConfiguration(process.env),
    )
    process.stdout.write(
      `${JSON.stringify({ companyId: state.companyId, created: state.created })}\n`,
    )
  } else {
    process.stdout.write(`${JSON.stringify({ provisioning: 'skipped' })}\n`)
  }
}
