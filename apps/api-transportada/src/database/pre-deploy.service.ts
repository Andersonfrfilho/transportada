/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createApiNotificationModule } from '../notification/infrastructure/notification-module.factory.js'
import { seedNotificationTemplates } from '../notification/application/notification-template-seed.service.js'
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
  /** O texto do aviso vem do catálogo em código; sem esta passada ele fica no do deploy anterior. */
  readonly seedTemplates?: (() => Promise<number>) | undefined
}

export type PreDeployReport =
  | {
      readonly migrated: true
      readonly provisioning: 'skipped'
      readonly templates: number | 'skipped'
    }
  | {
      readonly created: readonly ProvisionedArtifact[]
      readonly migrated: true
      readonly provisioning: 'ensured'
      readonly templates: number | 'skipped'
    }

/**
 * A Railway aceita um `preDeployCommand` só e o executa como argv, sem shell — encadear com
 * `&&` roda apenas o primeiro comando e deixa o deploy verde sem provisionar. Os dois passos
 * do arranque vivem aqui, num processo só, com a ordem garantida por código.
 */
export async function runPreDeploy({
  migrate,
  provision,
  seedTemplates,
}: PreDeploySteps): Promise<PreDeployReport> {
  await migrate()

  if (provision === undefined) {
    return { migrated: true, provisioning: 'skipped', templates: await runSeed(seedTemplates) }
  }

  const created = await provision()

  // Depois do provisionamento: a empresa precisa existir para o template pertencer a alguém.
  return {
    created,
    migrated: true,
    provisioning: 'ensured',
    templates: await runSeed(seedTemplates),
  }
}

async function runSeed(
  seedTemplates: PreDeploySteps['seedTemplates'],
): Promise<number | 'skipped'> {
  return seedTemplates === undefined ? 'skipped' : await seedTemplates()
}

if (import.meta.main) {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to apply database migrations')
  }

  const config = parseEnvironment(process.env)
  const companyId = config.companyId

  const report = await runPreDeploy({
    migrate: async () => {
      await runDatabaseMigrations({ connectionString })
    },
    // Ambiente que ainda não declarou empresa não tem a quem pertencer o template.
    seedTemplates:
      companyId === undefined
        ? undefined
        : async () => {
            const provider = createDrizzleProvider({
              connection: { adapter: 'postgres', max: 1, url: config.databaseUrl },
            })
            try {
              return await seedNotificationTemplates({
                companyId,
                module: createApiNotificationModule({ config, db: provider.db }),
              })
            } finally {
              await provider.close()
            }
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
