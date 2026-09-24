/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createApiNotificationModule } from '../notification/infrastructure/notification-module.factory.js'
import { seedNotificationTemplates } from '../notification/application/notification-template-seed.service.js'
import { seedOccurrenceTypeCatalog } from './occurrence-type-catalog-seed.service.js'
import { createDrizzleOccurrenceTypeCatalogSeedPort } from './occurrence-type-catalog-seed.repository.js'
import { runAllDatabaseMigrations } from './database-migration.service.js'
import {
  createDrizzleStoredObjectBucketRepairPort,
  repairStoredObjectBuckets,
} from './stored-object-bucket-repair.service.js'
import type { ProvisionedArtifact } from './environment-provisioning.constant.js'
import {
  isEnvironmentProvisioningConfigured,
  readEnvironmentProvisioningConfiguration,
  runEnvironmentProvisioning,
} from './environment-provisioning.service.js'
import { assertMigrationsAreComplete } from './migration-completeness.service.js'

export type PreDeploySteps = {
  readonly migrate: () => Promise<void>
  /** Lança `MigrationsPendingError` quando a pasta enviada tem migration que o banco não aplicou. */
  readonly verifyMigrationsComplete: () => Promise<number>
  readonly provision: (() => Promise<readonly ProvisionedArtifact[]>) | undefined
  /** O texto do aviso vem do catálogo em código; sem esta passada ele fica no do deploy anterior. */
  readonly seedTemplates?: (() => Promise<number>) | undefined
  /** O catálogo de tipos de ocorrência (spec 079) para toda empresa — sem ele nenhuma tela oferece
   * tipo para registrar ocorrência. */
  readonly seedOccurrenceTypes?: (() => Promise<number>) | undefined
  /** Reparo do literal `bucket: 'fiscal'` gravado por `src/trips/**` (spec 161) — idempotente. */
  readonly repairStoredObjectBuckets?: (() => Promise<number>) | undefined
}

export type PreDeployReport =
  | {
      readonly bucketRepairs: number | 'skipped'
      readonly migrated: true
      readonly migrationsChecked: number
      readonly occurrenceTypes: number | 'skipped'
      readonly provisioning: 'skipped'
      readonly templates: number | 'skipped'
    }
  | {
      readonly bucketRepairs: number | 'skipped'
      readonly created: readonly ProvisionedArtifact[]
      readonly migrated: true
      readonly migrationsChecked: number
      readonly occurrenceTypes: number | 'skipped'
      readonly provisioning: 'ensured'
      readonly templates: number | 'skipped'
    }

/**
 * A Railway aceita um `preDeployCommand` só e o executa como argv, sem shell — encadear com
 * `&&` roda apenas o primeiro comando e deixa o deploy verde sem provisionar. Os passos do arranque
 * vivem aqui, num processo só, com a ordem garantida por código.
 *
 * `verifyMigrationsComplete` roda logo depois de `migrate()`: o passo de migration só sabe dizer
 * "eu rodei", nunca "não sobrou nada" — em 19/09/2026 isso deixou 22 migrations da imagem sem
 * aplicar em staging por dias, com rotas respondendo 500. A trava fica antes de provisionar e de
 * semear, para nada rodar contra um schema incompleto.
 */
export async function runPreDeploy({
  migrate,
  verifyMigrationsComplete,
  provision,
  seedTemplates,
  seedOccurrenceTypes,
  repairStoredObjectBuckets: repairBuckets,
}: PreDeploySteps): Promise<PreDeployReport> {
  await migrate()
  const migrationsChecked = await verifyMigrationsComplete()

  if (provision === undefined) {
    return {
      bucketRepairs: await runSeed(repairBuckets),
      migrated: true,
      migrationsChecked,
      occurrenceTypes: await runSeed(seedOccurrenceTypes),
      provisioning: 'skipped',
      templates: await runSeed(seedTemplates),
    }
  }

  const created = await provision()

  // Depois do provisionamento: a empresa precisa existir para o template pertencer a alguém.
  return {
    bucketRepairs: await runSeed(repairBuckets),
    created,
    migrated: true,
    migrationsChecked,
    occurrenceTypes: await runSeed(seedOccurrenceTypes),
    provisioning: 'ensured',
    templates: await runSeed(seedTemplates),
  }
}

async function runSeed(seed: (() => Promise<number>) | undefined): Promise<number | 'skipped'> {
  return seed === undefined ? 'skipped' : await seed()
}

/** Mesma resolução de `resolveStorageBucket` (`src/main.ts`): `OBJECT_STORAGE_BUCKET`, com o
 * nome antigo `STORAGE_BUCKET` como alternativa. */
function resolveObjectStorageBucket(environment: Record<string, string | undefined>): string {
  const bucket = environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET
  if (bucket === undefined || bucket.trim() === '')
    throw new Error('Object storage bucket is required')
  return bucket
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
      await runAllDatabaseMigrations({ connectionString })
    },
    verifyMigrationsComplete: async () => assertMigrationsAreComplete({ connectionString }),
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
    // Roda para toda empresa existente — não depende de `companyId` declarado no ambiente.
    seedOccurrenceTypes: async () => {
      const provider = createDrizzleProvider({
        connection: { adapter: 'postgres', max: 1, url: config.databaseUrl },
      })
      try {
        return await seedOccurrenceTypeCatalog({
          port: createDrizzleOccurrenceTypeCatalogSeedPort(provider.db),
        })
      } finally {
        await provider.close()
      }
    },
    repairStoredObjectBuckets: async () => {
      const provider = createDrizzleProvider({
        connection: { adapter: 'postgres', max: 1, url: config.databaseUrl },
      })
      try {
        return await repairStoredObjectBuckets({
          bucket: resolveObjectStorageBucket(process.env),
          port: createDrizzleStoredObjectBucketRepairPort(provider.db),
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
