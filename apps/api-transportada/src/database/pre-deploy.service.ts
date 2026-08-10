/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { runDatabaseMigrations } from './database-migration.service.js'
import type { ProvisionedArtifact } from './environment-provisioning.constant.js'
import {
  isEnvironmentProvisioningConfigured,
  readEnvironmentProvisioningConfiguration,
  runEnvironmentProvisioning,
} from './environment-provisioning.service.js'

export type PreDeploySteps = {
  readonly migrate: () => Promise<void>
  readonly provision: (() => Promise<readonly ProvisionedArtifact[]>) | undefined
}

export type PreDeployReport =
  | { readonly migrated: true; readonly provisioning: 'skipped' }
  | {
      readonly created: readonly ProvisionedArtifact[]
      readonly migrated: true
      readonly provisioning: 'ensured'
    }

/**
 * A Railway aceita um `preDeployCommand` só e o executa como argv, sem shell — encadear com
 * `&&` roda apenas o primeiro comando e deixa o deploy verde sem provisionar. Os dois passos
 * do arranque vivem aqui, num processo só, com a ordem garantida por código.
 */
export async function runPreDeploy({
  migrate,
  provision,
}: PreDeploySteps): Promise<PreDeployReport> {
  await migrate()

  if (provision === undefined) {
    return { migrated: true, provisioning: 'skipped' }
  }

  return { created: await provision(), migrated: true, provisioning: 'ensured' }
}

if (import.meta.main) {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to apply database migrations')
  }

  const report = await runPreDeploy({
    migrate: async () => {
      await runDatabaseMigrations({ connectionString })
    },
    provision: isEnvironmentProvisioningConfigured(process.env)
      ? async () => {
          const state = await runEnvironmentProvisioning(
            readEnvironmentProvisioningConfiguration(process.env),
          )

          return state.created
        }
      : undefined,
  })

  process.stdout.write(`${JSON.stringify(report)}\n`)
}
