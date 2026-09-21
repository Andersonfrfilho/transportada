/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { NOTIFICATION_SCHEMA } from '../../src/database/notification-migration.service.js'
import { runPreDeploy } from '../../src/database/pre-deploy.service.js'
import { testWithPostgres, withDisposableDatabase } from './support.js'

const APP_ROOT = new URL('../../', import.meta.url).pathname
const PRE_DEPLOY_ENTRYPOINT = `${APP_ROOT}src/database/pre-deploy.service.ts`

describe('Pre-deploy da API', () => {
  test('provisiona depois da migration, nunca antes', async () => {
    const order: string[] = []

    await runPreDeploy({
      migrate: async () => {
        order.push('migrate')
      },
      verifyMigrationsComplete: async () => 0,
      provision: async () => {
        order.push('provision')
        return ['company']
      },
      seedTemplates: undefined,
    })

    expect(order).toEqual(['migrate', 'provision'])
  })

  test('ambiente sem empresa declarada migra e reporta o provisionamento pulado', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      verifyMigrationsComplete: async () => 0,
      provision: undefined,
      seedTemplates: undefined,
    })

    expect(report).toEqual({
      migrated: true,
      migrationsChecked: 0,
      occurrenceTypes: 'skipped',
      provisioning: 'skipped',
      templates: 'skipped',
    })
  })

  test('reporta o que foi criado para o deploy virar evidência', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      verifyMigrationsComplete: async () => 215,
      provision: async () => ['company'],
      seedTemplates: async () => 4,
      seedOccurrenceTypes: async () => 7,
    })

    expect(report).toEqual({
      created: ['company'],
      migrated: true,
      migrationsChecked: 215,
      occurrenceTypes: 7,
      provisioning: 'ensured',
      templates: 4,
    })
  })

  /**
   * O texto do template vem do catálogo em código: sem esta semeadura o aviso sai com o corpo do
   * deploy anterior, e ninguém percebe porque a entrega continua acontecendo.
   */
  test('semeia os templates depois do provisionamento, nunca antes', async () => {
    const order: string[] = []

    await runPreDeploy({
      migrate: async () => {
        order.push('migrate')
      },
      verifyMigrationsComplete: async () => 0,
      provision: async () => {
        order.push('provision')
        return []
      },
      seedTemplates: async () => {
        order.push('seed')
        return 0
      },
    })

    expect(order).toEqual(['migrate', 'provision', 'seed'])
  })

  // O catálogo de tipos de ocorrência é o que faz a tela de galpão/rua oferecer algo para
  // registrar — sem ele, nenhuma instalação consegue registrar ocorrência (defeito de 21/09/2026).
  test('semeia o catálogo de tipos de ocorrência depois do provisionamento, nunca antes', async () => {
    const order: string[] = []

    await runPreDeploy({
      migrate: async () => {
        order.push('migrate')
      },
      verifyMigrationsComplete: async () => 0,
      provision: async () => {
        order.push('provision')
        return []
      },
      seedOccurrenceTypes: async () => {
        order.push('occurrence-types')
        return 0
      },
    })

    expect(order).toEqual(['migrate', 'provision', 'occurrence-types'])
  })

  // Migration que falha não pode deixar o provisionamento rodar contra schema velho.
  test('migration que falha aborta antes de provisionar', async () => {
    let provisioned = false

    const failure = await runPreDeploy({
      migrate: async () => {
        throw new Error('migration failed')
      },
      verifyMigrationsComplete: async () => 0,
      provision: async () => {
        provisioned = true
        return []
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(provisioned).toBe(false)
  })

  // O incidente medido em 19/09/2026: `migrate()` retornou sem erro com 22 migrations sem aplicar.
  // A verificação tem de rodar sempre, e reprovar o deploy antes de provisionar ou semear.
  test('migration pendente aborta antes de provisionar e de semear', async () => {
    let provisioned = false
    let seeded = false
    let occurrenceTypesSeeded = false

    const failure = await runPreDeploy({
      migrate: async () => undefined,
      verifyMigrationsComplete: async () => {
        throw new Error('2 shipped migration(s) were not applied to the database')
      },
      provision: async () => {
        provisioned = true
        return []
      },
      seedTemplates: async () => {
        seeded = true
        return 0
      },
      seedOccurrenceTypes: async () => {
        occurrenceTypesSeeded = true
        return 0
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(provisioned).toBe(false)
    expect(seeded).toBe(false)
    expect(occurrenceTypesSeeded).toBe(false)
  })

  // Sem provisionamento configurado a verificação continua obrigatória — não é um passo opcional.
  test('migration pendente aborta mesmo sem provisionamento configurado', async () => {
    let seeded = false

    const failure = await runPreDeploy({
      migrate: async () => undefined,
      verifyMigrationsComplete: async () => {
        throw new Error('1 shipped migration(s) were not applied to the database')
      },
      provision: undefined,
      seedTemplates: async () => {
        seeded = true
        return 0
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(seeded).toBe(false)
  })

  test('sem migration pendente segue o fluxo normal e reporta quantas foram conferidas', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      verifyMigrationsComplete: async () => 3,
      provision: undefined,
      seedTemplates: undefined,
    })

    expect(report).toEqual({
      migrated: true,
      migrationsChecked: 3,
      occurrenceTypes: 'skipped',
      provisioning: 'skipped',
      templates: 'skipped',
    })
  })

  /**
   * O schema `notification` tem tabela de controle própria e não entra pelas migrations de
   * `drizzle/`. Migrar só o nosso schema deixa o seed de templates escrevendo numa tabela que não
   * existe — o pre-deploy morre e a Railway reprova o deploy inteiro, com o banco já migrado.
   */
  testWithPostgres('o passo de migration do pre-deploy cria o schema de notificação', async () => {
    await withDisposableDatabase(async (database, connectionString) => {
      await runAllDatabaseMigrations({ connectionString })

      const tables = await database<Array<{ readonly table_name: string }>>`
        select table_name
        from information_schema.tables
        where table_schema = ${NOTIFICATION_SCHEMA}
        order by table_name
      `

      expect(tables.map((table) => table.table_name)).toContain('templates')
    })
  })

  // O entrypoint tem de migrar tudo o que o seed vai encontrar; migrar só `drizzle/` foi o que
  // derrubou o deploy de produção em 15/08.
  test('o entrypoint migra pelo passo que inclui o schema de notificação', () => {
    const entrypoint = readFileSync(PRE_DEPLOY_ENTRYPOINT, 'utf8')

    expect(entrypoint).toContain('runAllDatabaseMigrations')
    expect(entrypoint).not.toMatch(/\bawait runDatabaseMigrations\(/)
  })

  // A imagem de runtime copia só as pastas de `src` que o pre-deploy precisa. Import novo que
  // caia fora dessa lista só quebra em produção, no contêiner, com `Cannot find module`.
  test('a imagem de runtime copia todo o grafo de imports do pre-deploy', () => {
    const dockerfile = readFileSync(`${APP_ROOT}Dockerfile`, 'utf8')
    const copied = [...dockerfile.matchAll(/^COPY apps\/api-transportada\/(src\/\S+) /gm)].map(
      (match) => match[1],
    )

    const missing = listImportClosure(PRE_DEPLOY_ENTRYPOINT)
      .map((file) => relative(APP_ROOT, file))
      .filter((file) => !copied.some((directory) => file.startsWith(`${directory}/`)))

    expect(missing).toEqual([])
  })
})

/** Resolve só import relativo — pacote externo vem do `node_modules` já copiado. */
function listImportClosure(entrypoint: string): readonly string[] {
  const visited = new Set<string>()
  const pending = [entrypoint]

  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) {
      continue
    }
    visited.add(file)

    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = resolveRelativeImport({ from: file, specifier: specifier ?? '' })
      if (target !== undefined) {
        pending.push(target)
      }
    }
  }

  return [...visited]
}

function resolveRelativeImport({
  from,
  specifier,
}: Readonly<{ from: string; specifier: string }>): string | undefined {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ''))

  return [`${base}.ts`, `${base}/index.ts`].find((candidate) => existsSync(candidate))
}
