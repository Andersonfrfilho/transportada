/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  DrizzleMigrationStatusRepository,
  type MigrationDatabase,
} from '../../src/database/drizzle-migration-status.repository.js'
import {
  listPendingMigrations,
  resolveMigrationsDirectory,
} from '../../src/database/migration-status.policy.js'
import { HealthService } from '../../src/health/health.service.js'
import type { DatabaseHealthPort, MigrationStatusPort } from '../../src/shared/api.types.js'

const NOW = new Date('2026-08-06T12:00:00.000Z')

describe('Prontidão de migrations', () => {
  test('pendente é a pasta enviada na imagem que não está no journal do banco', () => {
    const pending = listPendingMigrations({
      appliedNames: ['20260718224814_baseline', '20260719025322_tenant_identity'],
      shippedNames: [
        '20260718224814_baseline',
        '20260719025322_tenant_identity',
        '20260806161903_cte_fiscal_number_advanced_event',
      ],
    })

    expect(pending).toEqual(['20260806161903_cte_fiscal_number_advanced_event'])
  })

  test('banco à frente da imagem não conta como pendência', () => {
    const pending = listPendingMigrations({
      appliedNames: ['20260718224814_baseline', '20260719025322_tenant_identity'],
      shippedNames: ['20260718224814_baseline'],
    })

    expect(pending).toEqual([])
  })

  test('readiness fica degradada enquanto houver migration pendente', async () => {
    const health = createHealthService({ migrationStatus: pendingMigrations(6) })

    const readiness = await health.ready()

    expect(readiness.dependencies.migrations).toBe('down')
    expect(readiness.status).toBe('degraded')
  })

  test('readiness não expõe quais migrations faltam', async () => {
    const health = createHealthService({ migrationStatus: pendingMigrations(6) })

    const readiness = await health.ready()

    expect(JSON.stringify(readiness)).not.toContain('cte_fiscal_number_advanced_event')
  })

  test('journal ausente conta como não pronto, não como pronto', async () => {
    const health = createHealthService({
      migrationStatus: {
        async countPending() {
          throw new Error('relation "drizzle.__drizzle_migrations" does not exist')
        },
      },
    })

    const readiness = await health.ready()

    expect(readiness.dependencies.migrations).toBe('down')
    expect(readiness.status).toBe('degraded')
  })

  test('banco em dia deixa a readiness pronta', async () => {
    const health = createHealthService({ migrationStatus: pendingMigrations(0) })

    const readiness = await health.ready()

    expect(readiness.dependencies).toEqual({ database: 'up', identity: 'up', migrations: 'up' })
    expect(readiness.status).toBe('ok')
  })

  // Em dev o módulo roda de `src/database/`; na imagem ele vira `dist/main.js`, um nível acima.
  // Um caminho fixo acerta um layout e erra o outro — foi assim que a API não subiu em staging.
  test('a pasta de migrations é encontrada nos dois layouts, fonte e bundle', () => {
    const shipped = '/app/apps/api-transportada/drizzle/'

    const fromBundle = resolveMigrationsDirectory({
      candidates: ['/app/apps/drizzle/', shipped],
      exists: (path) => path === shipped,
    })
    const fromSource = resolveMigrationsDirectory({
      candidates: [shipped, '/app/apps/drizzle/'],
      exists: (path) => path === shipped,
    })

    expect(fromBundle).toBe(shipped)
    expect(fromSource).toBe(shipped)
  })

  test('pasta de migrations inexistente degrada a readiness em vez de derrubar o boot', async () => {
    const repository = new DrizzleMigrationStatusRepository({
      database: unreachableDatabase(),
      migrationsFolder: '/nao/existe/drizzle/',
    })
    const health = createHealthService({ migrationStatus: repository })

    const readiness = await health.ready()

    expect(readiness.dependencies.migrations).toBe('down')
  })

  // O deploy declarava o preDeployCommand em `deploy/api/railway.json` e a Railway nunca o leu:
  // sem esta asserção o pipeline volta a passar verde com o banco atrasado.
  test('o deploy da API reprova quando a readiness acusa migration pendente', () => {
    const script = readFileSync(
      new URL('../../../../.github/scripts/railway-deploy.sh', import.meta.url),
      'utf8',
    )

    expect(script).toContain('/health/ready')
    expect(script).toContain('assert_migrations_applied')
  })
})

/** A leitura da pasta falha antes de qualquer consulta — o banco nunca é tocado nesse caminho. */
function unreachableDatabase(): MigrationDatabase {
  return {} as unknown as MigrationDatabase
}

function pendingMigrations(total: number): MigrationStatusPort {
  return {
    async countPending() {
      return total
    },
  }
}

function createHealthService({
  migrationStatus,
}: Readonly<{ migrationStatus: MigrationStatusPort }>): HealthService {
  const database: DatabaseHealthPort = {
    async close() {},
    async healthCheck() {
      return { healthy: true }
    },
  }

  return new HealthService({
    database,
    identityReadiness: {
      async checkReadiness() {
        return true
      },
    },
    migrationStatus,
    now: () => NOW,
  })
}
