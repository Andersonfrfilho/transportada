/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname
const APPS_DIRECTORY = join(REPOSITORY_ROOT, 'apps')

/**
 * Membro do workspace é diretório **com `package.json`** — o glob `apps/*` do Bun ignora o resto.
 * Diretório de estado de ferramenta (`.omc` e afins) mora ali e não é app.
 */
async function listWorkspaceApps(): Promise<readonly string[]> {
  const entries = await readdir(APPS_DIRECTORY, { withFileTypes: true })
  const candidates = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const members = await Promise.all(
    candidates.map(async (app) => {
      const isMember = await Bun.file(join(APPS_DIRECTORY, app, 'package.json')).exists()
      return isMember ? app : null
    }),
  )

  return members.filter((app): app is string => app !== null)
}

async function listDockerfileApps(): Promise<readonly string[]> {
  const apps = await listWorkspaceApps()
  const withDockerfile = await Promise.all(
    apps.map(async (app) => {
      const exists = await Bun.file(join(APPS_DIRECTORY, app, 'Dockerfile')).exists()
      return exists ? app : null
    }),
  )

  return withDockerfile.filter((app): app is string => app !== null)
}

/**
 * O workspace da raiz é `apps/*`, e `bun install --frozen-lockfile` compara o `bun.lock` com **todos**
 * os membros. Um `package.json` que não é copiado para a imagem faz o Bun ver um membro sem
 * manifesto, recusar o lockfile, e o build morrer em segundos com "lockfile had changes".
 *
 * Isto já derrubou o deploy três vezes — uma por app nova que nasceu depois dos Dockerfiles. O
 * comentário no topo de cada um deles sempre disse a invariante ("os workspaces Bun exigem o
 * package.json de todas as apps"); o que faltava era alguém verificá-la. É o que este teste faz.
 */
describe('Dockerfile workspace manifests', () => {
  test('every Dockerfile copies the package.json of every app in the workspace', async () => {
    const apps = await listWorkspaceApps()
    const dockerfileApps = await listDockerfileApps()

    expect(dockerfileApps.length).toBeGreaterThan(0)

    for (const owner of dockerfileApps) {
      const dockerfile = await Bun.file(join(APPS_DIRECTORY, owner, 'Dockerfile')).text()
      const missing = apps.filter(
        (app) => !dockerfile.includes(`COPY apps/${app}/package.json apps/${app}/package.json`),
      )

      expect({ dockerfile: owner, missing }).toEqual({ dockerfile: owner, missing: [] })
    }
  })

  /** O lockfile é copiado junto, ou não há com o que comparar os manifestos. */
  test('every Dockerfile copies the root manifest and the lockfile', async () => {
    for (const owner of await listDockerfileApps()) {
      const dockerfile = await Bun.file(join(APPS_DIRECTORY, owner, 'Dockerfile')).text()

      expect(dockerfile).toContain('COPY package.json bun.lock ./')
    }
  })
})

describe('api image: o publicador de modelos roda de dentro dela', () => {
  /**
   * `railway ssh` + `occurrence-mail-templates-publish.ts` lê código e arquivos de modelo de várias pastas de `src`.
   * Pasta que o grafo de imports alcança e o Dockerfile não copia vira "Cannot find module" no container (visto em
   * 17/11/2026, quando a 325 acrescentou `expenses`): o contrato calcula o grafo e cobra cada pasta.
   */
  test('toda pasta de src que o publicador importa é copiada pelo Dockerfile', async () => {
    const apiRoot = join(REPOSITORY_ROOT, 'apps', 'api-transportada')
    const result = await Bun.build({
      entrypoints: [join(apiRoot, 'scripts', 'occurrence-mail-templates-publish.ts')],
      metafile: true,
      packages: 'external',
      target: 'bun',
    })
    expect(result.success).toBe(true)
    const folders = new Set(
      Object.keys(result.metafile?.inputs ?? {})
        .map((input) => input.replace(/^\.\//u, ''))
        .filter((input) => input.startsWith('src/'))
        .map((input) => input.slice(0, input.lastIndexOf('/'))),
    )
    const dockerfile = await Bun.file(join(apiRoot, 'Dockerfile')).text()
    const copied = [...dockerfile.matchAll(/^COPY apps\/api-transportada\/(\S+) /gmu)].map(
      (match) => (match[1] ?? '').replace(/\/$/u, ''),
    )
    const missing = [...folders].filter(
      (folder) => !copied.some((entry) => folder === entry || folder.startsWith(`${entry}/`)),
    )

    expect(folders.size).toBeGreaterThan(5)
    expect(missing).toEqual([])
  })

  test('as pastas de modelos de contas (e-mail e WhatsApp) também vão na imagem', async () => {
    const dockerfile = await Bun.file(
      join(REPOSITORY_ROOT, 'apps', 'api-transportada', 'Dockerfile'),
    ).text()

    expect(dockerfile).toContain('src/expenses/expense-mail-templates')
    expect(dockerfile).toContain('src/expenses/expense-whatsapp-templates')
  })
})
