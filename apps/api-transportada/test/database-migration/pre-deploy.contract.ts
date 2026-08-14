/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { runPreDeploy } from '../../src/database/pre-deploy.service.js'

const APP_ROOT = new URL('../../', import.meta.url).pathname
const PRE_DEPLOY_ENTRYPOINT = `${APP_ROOT}src/database/pre-deploy.service.ts`

describe('Pre-deploy da API', () => {
  test('provisiona depois da migration, nunca antes', async () => {
    const order: string[] = []

    await runPreDeploy({
      migrate: async () => {
        order.push('migrate')
      },
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
      provision: undefined,
      seedTemplates: undefined,
    })

    expect(report).toEqual({ migrated: true, provisioning: 'skipped', templates: 'skipped' })
  })

  test('reporta o que foi criado para o deploy virar evidência', async () => {
    const report = await runPreDeploy({
      migrate: async () => undefined,
      provision: async () => ['company'],
      seedTemplates: async () => 4,
    })

    expect(report).toEqual({
      created: ['company'],
      migrated: true,
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

  // Migration que falha não pode deixar o provisionamento rodar contra schema velho.
  test('migration que falha aborta antes de provisionar', async () => {
    let provisioned = false

    const failure = await runPreDeploy({
      migrate: async () => {
        throw new Error('migration failed')
      },
      provision: async () => {
        provisioned = true
        return []
      },
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(provisioned).toBe(false)
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
